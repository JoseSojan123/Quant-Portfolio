"""Orchestration layer between the API and the quant package.

Routes stay thin: they validate input and call into here. This module turns a
request (saved portfolio or ad-hoc asset list + settings) into quant-engine
inputs, runs the engines and shapes JSON-ready results. No formulas live here;
they all live in ``quant``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import OptimizationRun, Portfolio, User
from app.services.market_data import MarketSnapshot, UnknownTickerError
from quant import TRADING_DAYS
from quant.factors.market import asset_betas, portfolio_factor_exposure, sector_exposure, sector_risk_contribution
from quant.features.returns import asset_statistics, rolling_volatility
from quant.optimization.estimators import correlation_from_covariance, estimate_covariance, estimate_expected_returns
from quant.optimization.optimizer import CASH, Constraints
from quant.risk.metrics import (
    concentration,
    drawdown_details,
    drawdown_series,
    portfolio_returns,
    risk_contribution,
    risk_report,
)

DEFAULT_PREFERENCES = {
    "risk_free_rate": 0.04, "lookback_days": 756, "confidence": 0.95, "cost_rate": 0.001,
    "rebalance_threshold": 0.05, "return_method": "historical", "cov_method": "sample",
    "default_objective": "max_sharpe", "max_weight": 0.3, "mc_sims": 5000, "mc_horizon_days": 252,
}

OBJECTIVE_LABELS = {
    "min_variance": "Minimum variance", "max_sharpe": "Maximum Sharpe", "target_return": "Target return",
    "risk_parity": "Risk parity", "equal_weight": "Equal weight",
}


# --- helpers -----------------------------------------------------------------------------------


def sanitize(obj):
    """Make any engine output JSON-safe: numpy scalars -> Python, NaN/inf -> None."""
    if isinstance(obj, dict):
        return {str(k): sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        v = float(obj)
        return v if math.isfinite(v) else None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, pd.Series):
        return sanitize(obj.to_dict())
    if isinstance(obj, pd.Timestamp):
        return obj.date().isoformat()
    return obj


def preferences(user: User | None) -> dict:
    prefs = dict(DEFAULT_PREFERENCES)
    if user is not None and user.preferences:
        prefs.update({k: v for k, v in user.preferences.items() if k in DEFAULT_PREFERENCES})
    return prefs


def setting(req, name: str, prefs: dict):
    v = getattr(req, name, None)
    return prefs[name] if v is None else v


def get_owned_portfolio(db: Session, user: User, portfolio_id: str) -> Portfolio:
    p = db.get(Portfolio, portfolio_id)
    if p is None or p.owner_id != user.id:
        # Same response for "missing" and "not yours": never leak existence.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Portfolio not found")
    return p


def get_owned_run(db: Session, user: User, run_id: str) -> OptimizationRun:
    run = db.get(OptimizationRun, run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Optimization run not found")
    return run


# --- portfolio valuation -------------------------------------------------------------------------


def valuation(snap: MarketSnapshot, portfolio: Portfolio) -> dict:
    """Normalize holdings into the common portfolio object (V2 section 6)."""
    rows = []
    total_value = total_invested = day_change = 0.0
    for h in portfolio.holdings:
        t = h.ticker
        known = t in snap.close.columns
        price = snap.latest_price(t) if known else None
        prev = snap.previous_price(t) if known else None
        invested = h.quantity * h.average_cost
        value = h.quantity * price if price is not None else None
        meta = snap.meta.get(t, {})
        row = {
            "id": h.id, "ticker": t, "name": meta.get("name", t), "sector": meta.get("sector", "Unknown"),
            "asset_type": h.asset_type or meta.get("asset_type"), "currency": h.currency,
            "quantity": h.quantity, "average_cost": h.average_cost, "current_price": price,
            "invested_value": invested, "current_value": value,
            "unrealized_pnl": (value - invested) if value is not None else None,
            "unrealized_pnl_pct": ((value / invested - 1) if value is not None and invested else None),
            "day_change": (h.quantity * (price - prev)) if (price is not None and prev) else None,
            "day_change_pct": (price / prev - 1) if (price is not None and prev) else None,
            "notes": h.notes, "priced": known,
        }
        rows.append(row)
        total_invested += invested
        if value is not None:
            total_value += value
            if row["day_change"] is not None:
                day_change += row["day_change"]
    for r in rows:
        r["weight"] = (r["current_value"] / total_value) if (r["current_value"] is not None and total_value) else 0.0
    rows.sort(key=lambda r: -(r["current_value"] or 0))
    prev_total = total_value - day_change
    return {
        "holdings": rows,
        "current_value": total_value, "invested_value": total_invested,
        "unrealized_pnl": total_value - total_invested,
        "total_return": (total_value / total_invested - 1) if total_invested else None,
        "day_change": day_change, "day_change_pct": (day_change / prev_total) if prev_total else None,
        "price_date": snap.last_date.isoformat() if snap.last_date else None,
        "unpriced": [r["ticker"] for r in rows if not r["priced"]],
    }


# --- resolving the portfolio of a request ---------------------------------------------------------


@dataclass
class Context:
    tickers: list[str]
    weights: dict[str, float]
    capital: float
    portfolio: Portfolio | None = None
    valuation: dict | None = None
    quantities: dict[str, float] = field(default_factory=dict)
    cost_basis: dict[str, float] = field(default_factory=dict)
    source: str = "assets"


def resolve(db: Session, user: User, snap: MarketSnapshot, spec, *, require_weights: bool = True) -> Context:
    try:
        if spec.portfolio_id:
            p = get_owned_portfolio(db, user, spec.portfolio_id)
            if not p.holdings:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "This portfolio has no holdings yet. Add holdings first.")
            val = valuation(snap, p)
            if val["unpriced"]:
                raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                    f"No market data for: {', '.join(val['unpriced'])}. Remove or replace these holdings.")
            tickers = [r["ticker"] for r in val["holdings"]]
            weights = {r["ticker"]: r["weight"] for r in val["holdings"]}
            extra = [t for t in (spec.assets or []) if t not in tickers]
            if extra:  # allow adding candidate assets to the optimization universe
                tickers += snap.require(extra)
                weights.update(dict.fromkeys(extra, 0.0))
            return Context(tickers, weights, spec.capital or val["current_value"], p, val,
                           {h.ticker: h.quantity for h in p.holdings},
                           {h.ticker: h.quantity * h.average_cost for h in p.holdings}, "portfolio")
        tickers = snap.require(list(spec.assets or []) + [t for t in (spec.weights or {}) if t not in (spec.assets or [])])
        if not tickers:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one asset")
        if spec.weights:
            w = {t: max(float(spec.weights.get(t, 0.0)), 0.0) for t in tickers}
            total = sum(w.values())
            if total <= 0:
                if require_weights:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Weights must sum to a positive number")
                w = {t: 1 / len(tickers) for t in tickers}
            else:
                w = {t: v / total for t, v in w.items()}
        else:
            w = {t: 1 / len(tickers) for t in tickers}
        return Context(tickers, w, float(spec.capital or 100_000.0))
    except UnknownTickerError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@dataclass
class Inputs:
    returns: pd.DataFrame
    bench: pd.Series | None
    mu: pd.Series
    cov: pd.DataFrame
    rf: float
    lookback: int
    return_method: str
    cov_method: str

    def meta(self) -> dict:
        return {"start": self.returns.index[0].date().isoformat(), "end": self.returns.index[-1].date().isoformat(),
                "observations": int(len(self.returns)), "lookback_days": self.lookback,
                "return_method": self.return_method, "cov_method": self.cov_method, "risk_free_rate": self.rf,
                "annualization": TRADING_DAYS}


def build_inputs(snap: MarketSnapshot, tickers: list[str], req, prefs: dict) -> Inputs:
    lookback = int(setting(req, "lookback_days", prefs))
    rm = setting(req, "return_method", prefs)
    cm = setting(req, "cov_method", prefs)
    rf = float(setting(req, "risk_free_rate", prefs))
    risky = [t for t in tickers if t != CASH]
    rets, bench = snap.returns(risky, lookback)
    if len(rets) < 30:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Not enough overlapping price history for these assets (need at least 30 trading days).")
    mu = estimate_expected_returns(rets, rm, benchmark=bench, risk_free_rate=rf)
    cov = estimate_covariance(rets, cm)
    return Inputs(rets, bench, mu, cov, rf, lookback, rm, cm)


def constraints_from(req, prefs: dict, *, current: dict[str, float] | None = None) -> Constraints:
    max_w = getattr(req, "max_single_asset", None)
    return Constraints(
        long_only=getattr(req, "long_only", True),
        max_weight=float(max_w if max_w is not None else 1.0),
        min_weight=float(getattr(req, "min_weight", 0.0) or 0.0),
        sector_caps=dict(getattr(req, "sector_caps", {}) or {}),
        cash_floor=float(getattr(req, "cash_floor", 0.0) or 0.0),
        target_return=getattr(req, "target_return", None),
        turnover_cap=getattr(req, "turnover_cap", None),
        current_weights=current,
    )


# --- shared result builders -------------------------------------------------------------------------


def portfolio_metrics(inp: Inputs, weights: dict[str, float], confidence: float = 0.95, horizon_days: int = 1) -> dict:
    """Ex-ante + historical metrics for one weight vector (cash handled as a riskless sleeve)."""
    risky = {t: w for t, w in weights.items() if t != CASH}
    cash = weights.get(CASH, 0.0)
    r = inp.returns.copy()
    mu = inp.mu.copy()
    cov = inp.cov.copy()
    if cash > 0:
        r[CASH] = inp.rf / TRADING_DAYS
        mu[CASH] = inp.rf
        cov = cov.reindex(index=list(cov.index) + [CASH], columns=list(cov.columns) + [CASH]).fillna(0.0)
    cols = list(r.columns)
    w = pd.Series({**risky, **({CASH: cash} if cash > 0 else {})}).reindex(cols).fillna(0.0)
    rep = risk_report(r, w, mu.reindex(cols).to_numpy(), cov.loc[cols, cols].to_numpy(), inp.rf, confidence,
                      horizon_days, inp.bench)
    return rep.as_dict()


def explain_optimization(current: dict[str, float], optimized: dict[str, float], cur_m: dict, opt_m: dict,
                         cur_rc: dict[str, float], meta: dict[str, dict], objective: str) -> list[str]:
    """Plain-language explanation of what the optimizer changed and why (V2 section 8)."""
    out: list[str] = []
    sec = sector_exposure({k: v for k, v in current.items() if v > 0}, meta)
    if sec:
        top_sector, top_w = next(iter(sec.items()))
        if top_w >= 0.4:
            out.append(f"Your current portfolio is concentrated in {top_sector} ({top_w:.0%} of capital).")
    heavy = [(t, cur_rc.get(t, 0), w) for t, w in current.items() if w > 0.02 and cur_rc.get(t, 0) > 1.3 * w]
    heavy.sort(key=lambda x: -(x[1] - x[2]))
    if heavy:
        names = ", ".join(f"{t} ({w:.0%} of capital, {rc:.0%} of risk)" for t, rc, w in heavy[:2])
        out.append(f"Some holdings contribute disproportionately to portfolio risk: {names}.")
    deltas = sorted(((t, optimized.get(t, 0) - current.get(t, 0)) for t in set(current) | set(optimized)),
                    key=lambda x: x[1])
    cuts = [(t, d) for t, d in deltas if d < -0.02][:3]
    adds = [(t, d) for t, d in deltas[::-1] if d > 0.02][:3]
    label = OBJECTIVE_LABELS.get(objective, objective)
    if cuts or adds:
        parts = []
        if cuts:
            parts.append("reduces " + ", ".join(f"{t} by {abs(d):.0%}" for t, d in cuts))
        if adds:
            parts.append("adds to " + ", ".join(f"{t} (+{d:.0%})" for t, d in adds))
        out.append(f"The {label.lower()} optimizer " + " and ".join(parts) + ".")
    er_c, er_o = cur_m.get("expected_return"), opt_m.get("expected_return")
    v_c, v_o = cur_m.get("volatility"), opt_m.get("volatility")
    if None not in (er_c, er_o, v_c, v_o):
        if v_o < v_c - 0.005 and abs(er_o - er_c) <= 0.02:
            out.append(f"Volatility falls from {v_c:.1%} to {v_o:.1%} while the expected return stays similar "
                       f"({er_c:.1%} vs {er_o:.1%}).")
        elif v_o < v_c - 0.005:
            out.append(f"Volatility falls from {v_c:.1%} to {v_o:.1%}; the estimated expected return moves from "
                       f"{er_c:.1%} to {er_o:.1%}.")
        elif er_o > er_c + 0.005:
            out.append(f"The estimated expected return rises from {er_c:.1%} to {er_o:.1%}, with volatility moving "
                       f"from {v_c:.1%} to {v_o:.1%}.")
    out.append("Expected returns are estimated from historical data and are noisy; treat the recommendation as "
               "a starting point for judgment, not a forecast.")
    return out


def risk_payload(snap: MarketSnapshot, inp: Inputs, ctx: Context, confidence: float, horizon_days: int) -> dict:
    tickers = ctx.tickers
    w = pd.Series(ctx.weights).reindex(tickers).fillna(0.0)
    metrics = portfolio_metrics(inp, ctx.weights, confidence, horizon_days)
    rc_abs, rc_pct = risk_contribution(w.to_numpy(), inp.cov.loc[tickers, tickers].to_numpy())
    pr = portfolio_returns(inp.returns, w)
    values = (1 + pr).cumprod()
    dd = drawdown_series(values)
    rvol = rolling_volatility(pr, 63)
    bench_values = (1 + inp.bench).cumprod() if inp.bench is not None else None
    stats = asset_statistics(inp.returns, inp.rf)
    betas = asset_betas(inp.returns, inp.bench) if inp.bench is not None else None
    corr = correlation_from_covariance(inp.cov.loc[tickers, tickers])
    step = max(1, len(values) // 400)
    series = []
    for i in range(0, len(values), step):
        d = values.index[i]
        series.append({"date": d.date().isoformat(), "value": float(values.iloc[i]), "drawdown": float(dd.iloc[i]),
                       "benchmark": float(bench_values.iloc[i]) if bench_values is not None else None,
                       "rolling_vol": None if pd.isna(rvol.iloc[i]) else float(rvol.iloc[i])})
    hist_counts, edges = np.histogram(pr.to_numpy(), bins=40)
    rc_map = {t: float(v) for t, v in zip(tickers, rc_pct, strict=True)}
    var_es = {}
    for c in (0.95, 0.99):
        m = portfolio_metrics(inp, ctx.weights, c, horizon_days)
        var_es[str(c)] = {"var_hist": m["var_hist"], "es_hist": m["es_hist"], "var_param": m["var_param"],
                          "es_param": m["es_param"]}
    off = corr.to_numpy()[np.triu_indices(len(tickers), 1)]
    return {
        "metrics": metrics,
        "money": {k: (metrics[k] * ctx.capital if metrics.get(k) is not None else None)
                  for k in ("var_hist", "es_hist", "var_param", "es_param")},
        "var_table": var_es,
        "capital": ctx.capital, "confidence": confidence, "horizon_days": horizon_days,
        "weights": {t: float(w[t]) for t in tickers},
        "risk_contribution": [{"ticker": t, "weight": float(w[t]), "risk_contribution": float(rc_abs[i]),
                               "risk_pct": float(rc_pct[i]), "sector": snap.meta.get(t, {}).get("sector")}
                              for i, t in enumerate(tickers)],
        "correlation": {"tickers": tickers, "matrix": corr.round(4).to_numpy().tolist(),
                        "average_pairwise": float(off.mean()) if off.size else None},
        "concentration": concentration(w.to_numpy()),
        "sector_exposure": sector_exposure(ctx.weights, snap.meta),
        "sector_risk": sector_risk_contribution(rc_map, snap.meta),
        "drawdown": drawdown_details(values),
        "series": series,
        "histogram": [{"lo": float(edges[i]), "hi": float(edges[i + 1]), "count": int(hist_counts[i])}
                      for i in range(len(hist_counts))],
        "asset_stats": [{"ticker": t, "name": snap.meta.get(t, {}).get("name", t),
                         "sector": snap.meta.get(t, {}).get("sector"),
                         "expected_return": float(inp.mu[t]), "volatility": float(np.sqrt(inp.cov.loc[t, t])),
                         **{k: stats.loc[t, k] for k in ("cagr", "max_drawdown", "sharpe", "skew", "kurtosis",
                                                          "worst_day", "best_day")},
                         "beta": float(betas.loc[t, "beta"]) if betas is not None else None,
                         "alpha": float(betas.loc[t, "alpha"]) if betas is not None else None,
                         "r_squared": float(betas.loc[t, "r_squared"]) if betas is not None else None}
                        for t in tickers],
        "factor_exposure": portfolio_factor_exposure(ctx.weights, betas) if betas is not None else None,
        "inputs": inp.meta(),
    }


def insights(val: dict, risk: dict) -> list[dict]:
    """Rule-based "what should I investigate next" prompts for the dashboard."""
    out = []
    holdings = val["holdings"]
    if holdings:
        top = holdings[0]
        if top["weight"] >= 0.3:
            out.append({"level": "warning", "title": f"{top['ticker']} is {top['weight']:.0%} of the portfolio",
                        "body": "A single position this large dominates outcomes. Check its risk contribution.",
                        "href": "/risk"})
    for r in risk["risk_contribution"]:
        if r["weight"] > 0.02 and r["risk_pct"] > 1.5 * r["weight"] and r["risk_pct"] > 0.15:
            out.append({"level": "warning", "title": f"{r['ticker']} drives {r['risk_pct']:.0%} of risk",
                        "body": f"It is only {r['weight']:.0%} of capital. Consider whether that exposure is intended.",
                        "href": "/risk"})
            break
    sec = risk["sector_exposure"]
    if sec:
        s, wt = next(iter(sec.items()))
        if wt >= 0.5:
            out.append({"level": "info", "title": f"{wt:.0%} in {s}",
                        "body": "Sector concentration means one shock can hit most of the portfolio. Try a stress test.",
                        "href": "/stress-test"})
    avg = risk["correlation"].get("average_pairwise")
    if avg is not None and avg > 0.6:
        out.append({"level": "info", "title": f"Holdings are highly correlated (avg {avg:.2f})",
                    "body": "Owning many names that move together gives little diversification.", "href": "/risk"})
    m = risk["metrics"]
    if m.get("sharpe") is not None:
        out.append({"level": "action", "title": "See if a constrained optimizer can do better",
                    "body": f"Current estimated Sharpe ratio is {m['sharpe']:.2f}. Compare it with optimized allocations.",
                    "href": "/optimize"})
    out.append({"level": "action", "title": "Simulate the next year",
                "body": "Run Monte Carlo to see the range of outcomes and the probability of a loss.",
                "href": "/monte-carlo"})
    return out[:5]


def latest_run(db: Session, user: User, portfolio_id: str | None) -> OptimizationRun | None:
    q = select(OptimizationRun).where(OptimizationRun.user_id == user.id)
    if portfolio_id:
        q = q.where(OptimizationRun.portfolio_id == portfolio_id)
    return db.scalars(q.order_by(OptimizationRun.created_at.desc()).limit(1)).first()
