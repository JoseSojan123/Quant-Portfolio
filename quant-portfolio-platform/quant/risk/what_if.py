"""What-if analysis on a real (quantity-based) portfolio (V2 addendum section 9).

Supported questions
  add_cash         "What if I add $X?"          new money split pro rata or into one ticker
  asset_shock      "What if NVDA falls 20%?"    one asset's price moves
  market_shock     "What if the market falls 15%?" each asset moves beta_i x shock
  reduce_holding   "What if I cut a holding by 10 percentage points?" proceeds go to the
                   other holdings pro rata
  rebalance_to     "What if I rebalance to the optimized allocation?"

Each answer reports value, P&L, % change, the largest contributors and how the
risk metrics (volatility, Sharpe, VaR, ES, drawdown, beta) change.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant.risk.metrics import (
    beta_alpha,
    historical_es,
    historical_var,
    max_drawdown,
    portfolio_return,
    portfolio_returns,
    portfolio_volatility,
    sharpe_ratio,
)

ACTIONS = ("add_cash", "asset_shock", "market_shock", "reduce_holding", "rebalance_to")


def _weights(qty: dict[str, float], prices: dict[str, float]) -> tuple[dict[str, float], float]:
    vals = {t: q * prices[t] for t, q in qty.items()}
    total = sum(vals.values())
    return ({t: v / total for t, v in vals.items()} if total > 0 else {}), total


def _risk(weights: dict[str, float], returns: pd.DataFrame, mu: pd.Series, cov: pd.DataFrame, rf: float,
          bench: pd.Series | None) -> dict:
    tick = [t for t in weights if t in returns.columns]
    w = pd.Series({t: weights[t] for t in tick})
    wv = w.to_numpy()
    er = portfolio_return(wv, mu[tick].to_numpy())
    vol = portfolio_volatility(wv, cov.loc[tick, tick].to_numpy())
    pr = portfolio_returns(returns[tick], w)
    out = {"expected_return": er, "volatility": vol, "sharpe": sharpe_ratio(er, vol, rf),
           "var_95": historical_var(pr, 0.95), "es_95": historical_es(pr, 0.95),
           "max_drawdown": max_drawdown((1 + pr).cumprod())}
    if bench is not None:
        out["beta"] = beta_alpha(pr, bench.reindex(pr.index))["beta"]
    return {k: (None if v is None or not np.isfinite(v) else float(v)) for k, v in out.items()}


def what_if(
    action: dict,
    quantities: dict[str, float],
    cost_basis: dict[str, float],
    prices: dict[str, float],
    returns: pd.DataFrame,
    mu: pd.Series,
    cov: pd.DataFrame,
    *,
    risk_free_rate: float = 0.0,
    benchmark_returns: pd.Series | None = None,
    betas: dict[str, float] | None = None,
    cost_rate: float = 0.001,
) -> dict:
    kind = action.get("type")
    if kind not in ACTIONS:
        raise ValueError(f"unknown what-if type {kind!r}; expected one of {ACTIONS}")
    w0, v0 = _weights(quantities, prices)
    if v0 <= 0:
        raise ValueError("portfolio has no value")
    invested0 = sum(cost_basis.get(t, 0.0) for t in quantities)
    q1 = dict(quantities)
    p1 = dict(prices)
    contributions: dict[str, float] = dict.fromkeys(quantities, 0.0)
    added = 0.0
    cost = 0.0
    description = ""

    if kind == "add_cash":
        amount = float(action.get("amount", 0))
        if amount <= 0:
            raise ValueError("amount must be positive")
        target = (action.get("ticker") or "").upper() or None
        if target:
            if target not in prices:
                raise ValueError(f"no price for {target}")
            q1[target] = q1.get(target, 0.0) + amount / prices[target]
            contributions.setdefault(target, 0.0)
            description = f"Invest an extra ${amount:,.0f} in {target}"
        else:
            for t, w in w0.items():
                q1[t] += amount * w / prices[t]
            description = f"Invest an extra ${amount:,.0f} pro rata across current holdings"
        added = amount
    elif kind == "asset_shock":
        t = (action.get("ticker") or "").upper()
        shock = float(action.get("shock", 0))
        if t not in quantities:
            raise ValueError(f"{t} is not in this portfolio")
        p1[t] = prices[t] * (1 + shock)
        contributions[t] = quantities[t] * prices[t] * shock
        description = f"{t} moves {shock:+.0%}, everything else unchanged"
    elif kind == "market_shock":
        shock = float(action.get("shock", 0))
        for t in quantities:
            b = (betas or {}).get(t, 1.0)
            b = 1.0 if b is None or not np.isfinite(b) else b
            s = max(-1.0, b * shock)
            p1[t] = prices[t] * (1 + s)
            contributions[t] = quantities[t] * prices[t] * s
        description = f"Market moves {shock:+.0%}; each holding moves by its beta x the market move"
    elif kind == "reduce_holding":
        t = (action.get("ticker") or "").upper()
        pp = float(action.get("percentage_points", 0))
        if t not in quantities:
            raise ValueError(f"{t} is not in this portfolio")
        cut = min(pp, w0[t])
        others = {k: w for k, w in w0.items() if k != t}
        tot_o = sum(others.values())
        if tot_o <= 0:
            raise ValueError("cannot redistribute: no other holdings")
        new_w = {t: w0[t] - cut, **{k: w + cut * w / tot_o for k, w in others.items()}}
        to = sum(abs(new_w[k] - w0[k]) for k in new_w)
        cost = to * cost_rate * v0
        v_after = v0 - cost
        q1 = {k: new_w[k] * v_after / prices[k] for k in new_w}
        description = f"Cut {t} by {cut:.0%} of the portfolio and spread the proceeds over the other holdings"
    elif kind == "rebalance_to":
        target = {k.upper(): float(v) for k, v in (action.get("weights") or {}).items() if float(v) > 1e-9}
        if not target:
            raise ValueError("rebalance_to needs target weights")
        missing = [k for k in target if k not in prices and k != "CASH"]
        if missing:
            raise ValueError(f"no price for {', '.join(missing)}")
        tot = sum(target.values())
        target = {k: v / tot for k, v in target.items() if k != "CASH"}
        tot = sum(target.values())
        target = {k: v / tot for k, v in target.items()}
        to = sum(abs(target.get(k, 0) - w0.get(k, 0)) for k in set(target) | set(w0))
        cost = to * cost_rate * v0
        v_after = v0 - cost
        q1 = {k: target[k] * v_after / prices[k] for k in target}
        for k in q1:
            contributions.setdefault(k, 0.0)
        description = "Rebalance to the selected target allocation (transaction costs included)"

    w1, v1 = _weights({k: v for k, v in q1.items() if v > 0}, p1)
    market_pnl = float(sum(contributions.values()))
    pnl = market_pnl - cost
    rows = []
    for t in sorted(set(quantities) | set(q1)):
        before_v = quantities.get(t, 0.0) * prices[t]
        after_v = q1.get(t, 0.0) * p1[t]
        rows.append({"ticker": t, "weight_before": w0.get(t, 0.0), "weight_after": w1.get(t, 0.0),
                     "value_before": before_v, "value_after": after_v, "pnl": contributions.get(t, 0.0)})
    rows.sort(key=lambda r: r["pnl"])

    # Risk metrics use post-scenario weights on the same history (prices shocks change weights, not history).
    risk_before = _risk(w0, returns, mu, cov, risk_free_rate, benchmark_returns)
    risk_after = _risk(w1, returns, mu, cov, risk_free_rate, benchmark_returns)
    return {
        "type": kind, "description": description,
        "value_before": v0, "value_after": v1, "value_change": v1 - v0,
        "pnl": pnl, "pct_change": pnl / v0, "transaction_cost": cost, "cash_added": added,
        "invested_before": invested0, "invested_after": invested0 + added,
        "unrealized_pnl_before": v0 - invested0, "unrealized_pnl_after": v1 - (invested0 + added),
        "holdings": rows,
        "largest_contributors": [r for r in rows if r["pnl"] < 0][:3] or [r for r in rows[::-1] if r["pnl"] > 0][:3],
        "risk_before": risk_before, "risk_after": risk_after,
    }
