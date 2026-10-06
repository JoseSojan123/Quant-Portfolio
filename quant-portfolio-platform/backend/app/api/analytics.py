"""Quantitative endpoints (blueprint section 25 + V2 addendum).

POST /portfolio/optimize        constrained optimization, current vs optimized
POST /portfolio/frontier        efficient frontier + random feasible portfolios
POST /portfolio/rebalance       drift, turnover, costs and a trade list
POST /risk/metrics              volatility, VaR/ES, drawdown, risk contribution, correlation, betas
GET  /risk/scenarios            predefined stress scenarios
POST /risk/stress               stress tests (predefined + custom)
POST /simulation/monte-carlo    simulated outcome distribution
POST /backtest                  walk-forward backtest vs benchmark
POST /what-if                   scenario analysis on a saved portfolio
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_snapshot, heavy_rate_limit
from app.core.config import get_settings
from app.db.models import (
    OptimizationRun,
    PortfolioWeight,
    RebalanceItem,
    RebalanceRun,
    RiskMetric,
    SavedScenario,
    StressResult,
    User,
)
from app.db.session import get_db
from app.schemas.analytics import (
    BacktestRequest,
    FrontierRequest,
    MonteCarloRequest,
    OptimizeRequest,
    RebalanceRequest,
    RiskRequest,
    StressRequest,
    WhatIfRequest,
)
from app.services import analytics as A
from app.services.market_data import MarketSnapshot
from quant.backtest.walk_forward import walk_forward_backtest
from quant.factors.market import asset_betas, sector_exposure
from quant.optimization.optimizer import CASH, Constraints, OptimizationError, efficient_frontier, optimize
from quant.rebalancing.rebalance import rebalance_plan
from quant.risk.metrics import portfolio_volatility, risk_contribution
from quant.risk.what_if import what_if
from quant.simulation.monte_carlo import run_monte_carlo
from quant.stress.scenarios import PREDEFINED_SCENARIOS, SCENARIOS_BY_ID, custom_scenario, run_stress_test

router = APIRouter(tags=["analytics"])


def _sectors(snap: MarketSnapshot, tickers: list[str]) -> dict[str, str]:
    return {t: snap.meta.get(t, {}).get("sector", "Other") for t in tickers}


def _effective_max_weight(req_max: float | None, prefs: dict, n: int) -> float:
    """Explicit request value wins; otherwise the user's preference, relaxed if it is infeasible for n assets."""
    if req_max is not None:
        return float(req_max)
    pref = float(prefs["max_weight"])
    return pref if pref * n >= 1 - 1e-9 else 1.0


def _opt_error(exc: Exception) -> HTTPException:
    return HTTPException(422, str(exc))


# --- optimization ------------------------------------------------------------------------------------


@router.post("/portfolio/optimize", dependencies=[Depends(heavy_rate_limit)])
def optimize_portfolio(req: OptimizeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                       snap: MarketSnapshot = Depends(get_snapshot)):
    prefs = A.preferences(user)
    ctx = A.resolve(db, user, snap, req)
    inp = A.build_inputs(snap, ctx.tickers, req, prefs)
    has_baseline = ctx.source == "portfolio" or bool(req.weights)
    baseline = ctx.weights if has_baseline else {t: 1 / len(ctx.tickers) for t in ctx.tickers}
    baseline_label = "Current" if has_baseline else "Equal weight"
    req.max_single_asset = _effective_max_weight(req.max_single_asset, prefs, len(ctx.tickers))
    cons = A.constraints_from(req, prefs, current=baseline if req.turnover_cap else None)
    sectors = _sectors(snap, ctx.tickers)
    try:
        res = optimize(inp.mu, inp.cov, req.objective, cons, inp.rf, sectors)
    except OptimizationError as exc:
        raise _opt_error(exc) from exc

    opt_w = {t: float(w) for t, w in res.weights.items()}
    cur_m = A.portfolio_metrics(inp, baseline, prefs["confidence"])
    opt_m = A.portfolio_metrics(inp, opt_w, prefs["confidence"])
    cur_vec = np.array([baseline.get(t, 0.0) for t in ctx.tickers])
    _, cur_rc = risk_contribution(cur_vec, inp.cov.loc[ctx.tickers, ctx.tickers].to_numpy())
    cur_rc_map = {t: float(v) for t, v in zip(ctx.tickers, cur_rc, strict=True)}
    opt_rc_map = {t: float(v) for t, v in res.risk_contribution.items()}

    capital = ctx.capital
    changes = []
    for t in list(dict.fromkeys(ctx.tickers + list(opt_w))):
        cw, ow = baseline.get(t, 0.0), opt_w.get(t, 0.0)
        price = 1.0 if t == CASH else snap.latest_price(t)
        changes.append({"ticker": t, "name": "Cash" if t == CASH else snap.meta.get(t, {}).get("name", t),
                        "sector": "Cash" if t == CASH else snap.meta.get(t, {}).get("sector"),
                        "current_weight": cw, "optimized_weight": ow, "change": ow - cw,
                        "current_value": cw * capital, "target_value": ow * capital, "trade_value": (ow - cw) * capital,
                        "price": price, "shares": (ow - cw) * capital / price if price else None,
                        "current_risk_pct": cur_rc_map.get(t, 0.0), "optimized_risk_pct": opt_rc_map.get(t, 0.0)})
    changes.sort(key=lambda r: -r["optimized_weight"])
    turnover = float(sum(abs(c["change"]) for c in changes))

    result = {
        "objective": req.objective, "objective_label": A.OBJECTIVE_LABELS[req.objective],
        "capital": capital, "baseline_label": baseline_label,
        "current": {"weights": baseline, "metrics": cur_m, "risk_contribution": cur_rc_map,
                    "sector_exposure": sector_exposure(baseline, snap.meta)},
        "optimized": {"weights": opt_w, "metrics": opt_m, "risk_contribution": opt_rc_map,
                      "sector_exposure": sector_exposure(opt_w, snap.meta)},
        "changes": changes, "turnover": turnover,
        "explanation": A.explain_optimization(baseline, opt_w, cur_m, opt_m, cur_rc_map, snap.meta, req.objective),
        "warnings": res.warnings,
        "constraints": {"long_only": cons.long_only, "max_single_asset": cons.max_weight, "min_weight": cons.min_weight,
                        "sector_caps": cons.sector_caps, "cash_floor": cons.cash_floor,
                        "target_return": cons.target_return, "turnover_cap": cons.turnover_cap},
        "inputs": inp.meta(),
        "assets": [{"ticker": t, "name": snap.meta.get(t, {}).get("name", t), "sector": sectors[t],
                    "expected_return": float(inp.mu[t]), "volatility": float(np.sqrt(inp.cov.loc[t, t]))}
                   for t in ctx.tickers],
        "portfolio_id": ctx.portfolio.id if ctx.portfolio else None,
        "data": {"source": snap.source, "as_of": snap.last_date.isoformat() if snap.last_date else None},
    }
    result = A.sanitize(result)
    if req.save:
        run = OptimizationRun(user_id=user.id, portfolio_id=ctx.portfolio.id if ctx.portfolio else None,
                              name=req.name or f"{A.OBJECTIVE_LABELS[req.objective]} run", objective=req.objective,
                              capital=capital, request=A.sanitize(req.model_dump()), result=result)
        db.add(run)
        db.flush()
        for t, w in opt_w.items():
            db.add(PortfolioWeight(run_id=run.run_id, ticker=t, weight=w, current_weight=baseline.get(t)))
        db.add(RiskMetric(run_id=run.run_id, expected_return=opt_m["expected_return"], volatility=opt_m["volatility"],
                          sharpe=opt_m["sharpe"], var_95=opt_m["var_hist"], es_95=opt_m["es_hist"],
                          max_drawdown=opt_m["max_drawdown"]))
        db.commit()
        result["run_id"] = run.run_id
        result["saved_at"] = run.created_at.isoformat()
    return result


@router.post("/portfolio/frontier", dependencies=[Depends(heavy_rate_limit)])
def frontier(req: FrontierRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
             snap: MarketSnapshot = Depends(get_snapshot)):
    prefs = A.preferences(user)
    ctx = A.resolve(db, user, snap, req)
    if len(ctx.tickers) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The efficient frontier needs at least two assets")
    inp = A.build_inputs(snap, ctx.tickers, req, prefs)
    req.max_single_asset = _effective_max_weight(req.max_single_asset, prefs, len(ctx.tickers))
    cons = A.constraints_from(req, prefs)
    sectors = _sectors(snap, ctx.tickers)
    try:
        ef = efficient_frontier(inp.mu, inp.cov, cons, inp.rf, sectors, n_points=req.n_points)
        selected = optimize(inp.mu, inp.cov, req.objective, cons, inp.rf, sectors) if req.objective else None
    except OptimizationError as exc:
        raise _opt_error(exc) from exc
    w = np.array([ctx.weights.get(t, 0.0) for t in ctx.tickers])
    cur_vol = portfolio_volatility(w, inp.cov.loc[ctx.tickers, ctx.tickers].to_numpy())
    cur_ret = float(w @ inp.mu[ctx.tickers].to_numpy())
    has_baseline = ctx.source == "portfolio" or bool(req.weights)
    ef["current"] = {"label": "Current" if has_baseline else "Equal weight", "volatility": cur_vol,
                     "expected_return": cur_ret, "sharpe": (cur_ret - inp.rf) / cur_vol if cur_vol > 0 else None}
    ef["selected"] = selected.as_dict() if selected else None
    ef["selected_label"] = A.OBJECTIVE_LABELS.get(req.objective)
    ef["constraints"] = {"max_single_asset": cons.max_weight, "long_only": cons.long_only,
                         "sector_caps": cons.sector_caps, "cash_floor": cons.cash_floor}
    ef["inputs"] = inp.meta()
    return A.sanitize(ef)


# --- risk ----------------------------------------------------------------------------------------------


@router.post("/risk/metrics")
def risk_metrics(req: RiskRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                 snap: MarketSnapshot = Depends(get_snapshot)):
    prefs = A.preferences(user)
    ctx = A.resolve(db, user, snap, req)
    inp = A.build_inputs(snap, ctx.tickers, req, prefs)
    conf = req.confidence or prefs["confidence"]
    return A.sanitize(A.risk_payload(snap, inp, ctx, conf, req.horizon_days))


@router.get("/risk/scenarios")
def list_scenarios():
    return [s.as_dict() for s in PREDEFINED_SCENARIOS]


@router.post("/risk/stress")
def stress(req: StressRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
           snap: MarketSnapshot = Depends(get_snapshot)):
    prefs = A.preferences(user)
    ctx = A.resolve(db, user, snap, req)
    inp = A.build_inputs(snap, ctx.tickers, req, prefs)
    betas = asset_betas(inp.returns, inp.bench)["beta"].to_dict() if inp.bench is not None else {}
    ids = req.scenario_ids if req.scenario_ids is not None else [s.id for s in PREDEFINED_SCENARIOS]
    unknown = [i for i in ids if i not in SCENARIOS_BY_ID]
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown scenario(s): {', '.join(unknown)}")
    scenarios = [SCENARIOS_BY_ID[i] for i in ids]
    if req.custom and (req.custom.shocks or req.custom.sector_shocks):
        scenarios.append(custom_scenario(req.custom.shocks, req.custom.name, req.custom.sector_shocks))
    results = []
    for sc in scenarios:
        r = run_stress_test(sc, ctx.weights, ctx.capital, snap.meta, betas, snap.adjusted)
        for c in r["contributions"]:
            c["name"] = snap.meta.get(c["ticker"], {}).get("name", c["ticker"])
            c["sector"] = snap.meta.get(c["ticker"], {}).get("sector")
            c["beta"] = betas.get(c["ticker"])
        results.append(r)
        if req.save:
            db.add(StressResult(user_id=user.id, portfolio_id=ctx.portfolio.id if ctx.portfolio else None,
                                scenario=sc.id, pnl=r["pnl"], loss_pct=r["pct_change"]))
    if req.save:
        db.commit()
    worst = min(results, key=lambda r: r["pct_change"]) if results else None
    return A.sanitize({"capital": ctx.capital, "results": results, "betas": betas,
                       "worst": {"scenario": worst["scenario"]["name"], "pct_change": worst["pct_change"],
                                 "pnl": worst["pnl"]} if worst else None,
                       "inputs": inp.meta()})


# --- simulation ------------------------------------------------------------------------------------------


@router.post("/simulation/monte-carlo", dependencies=[Depends(heavy_rate_limit)])
def monte_carlo(req: MonteCarloRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                snap: MarketSnapshot = Depends(get_snapshot)):
    s = get_settings()
    prefs = A.preferences(user)
    ctx = A.resolve(db, user, snap, req)
    inp = A.build_inputs(snap, ctx.tickers, req, prefs)
    horizon = int(req.horizon_days or prefs["mc_horizon_days"])
    sims = int(req.n_sims or prefs["mc_sims"])
    if sims > s.max_mc_simulations or horizon > s.max_mc_horizon_days or sims * horizon > s.max_mc_cells:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Simulation too large: keep simulations x horizon under {s.max_mc_cells:,} "
                            f"(e.g. 5,000 simulations x 1 year).")
    w = pd.Series(ctx.weights)
    target = req.target_value or ctx.capital * 1.10
    try:
        res = run_monte_carlo(w, inp.mu, inp.cov, initial_value=ctx.capital, horizon_days=horizon, n_sims=sims,
                              method=req.method, historical_returns=inp.returns, target_value=target, seed=req.seed,
                              loss_threshold=req.loss_threshold)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    res["inputs"] = inp.meta()
    res["weights"] = ctx.weights
    res["assumptions"] = {
        "normal": "Daily asset returns are multivariate normal with the estimated mean and covariance.",
        "student_t": "Daily asset returns are multivariate Student-t (5 degrees of freedom): same covariance, fatter tails.",
        "bootstrap": "Each simulated day is a randomly drawn historical day from the estimation window (all assets together).",
    }[req.method]
    return A.sanitize(res)


# --- rebalancing ----------------------------------------------------------------------------------------


@router.post("/portfolio/rebalance")
def rebalance(req: RebalanceRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
              snap: MarketSnapshot = Depends(get_snapshot)):
    prefs = A.preferences(user)
    ctx = A.resolve(db, user, snap, req)
    target_label = "Custom target"
    if req.target_weights:
        target = {k.upper(): float(v) for k, v in req.target_weights.items() if float(v) > 0}
        unknown = [t for t in target if t != CASH and t not in snap.close.columns]
        if unknown:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown ticker(s): {', '.join(unknown)}")
    elif req.target_run_id:
        run = A.get_owned_run(db, user, req.target_run_id)
        target = dict(run.result["optimized"]["weights"])
        target_label = run.name or A.OBJECTIVE_LABELS.get(run.objective, run.objective)
    elif req.target_objective:
        inp = A.build_inputs(snap, ctx.tickers, req, prefs)
        max_w = _effective_max_weight(req.max_single_asset, prefs, len(ctx.tickers))
        try:
            res = optimize(inp.mu, inp.cov, req.target_objective, Constraints(max_weight=max_w), inp.rf,
                           _sectors(snap, ctx.tickers))
        except OptimizationError as exc:
            raise _opt_error(exc) from exc
        target = {t: float(w) for t, w in res.weights.items()}
        target_label = A.OBJECTIVE_LABELS[req.target_objective]
    else:
        target = {t: 1 / len(ctx.tickers) for t in ctx.tickers}
        target_label = "Equal weight"
    total = sum(target.values())
    if total <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Target weights must sum to a positive number")
    target = {k: v / total for k, v in target.items()}
    prices = {t: snap.latest_price(t) for t in set(target) | set(ctx.weights) if t != CASH}
    plan = rebalance_plan(ctx.weights, target, ctx.capital, prices,
                          cost_rate=req.cost_rate if req.cost_rate is not None else prefs["cost_rate"],
                          threshold=req.threshold if req.threshold is not None else prefs["rebalance_threshold"],
                          whole_shares=req.whole_shares, force=req.force)
    for r in plan["trades"]:
        r["name"] = "Cash" if r["ticker"] == CASH else snap.meta.get(r["ticker"], {}).get("name", r["ticker"])
        if ctx.quantities:
            r["current_shares"] = ctx.quantities.get(r["ticker"], 0.0)
    plan["target_label"] = target_label
    if req.save:
        run = RebalanceRun(user_id=user.id, portfolio_id=ctx.portfolio.id if ctx.portfolio else None,
                           turnover=plan["turnover"], cost=plan["estimated_cost"], cost_rate=plan["cost_rate"],
                           threshold=plan["threshold"])
        db.add(run)
        db.flush()
        for r in plan["trades"]:
            db.add(RebalanceItem(run_id=run.run_id, ticker=r["ticker"], current_weight=r["current_weight"],
                                 target_weight=r["target_weight"], trade_value=r["trade_value"]))
        db.commit()
        plan["run_id"] = run.run_id
    return A.sanitize(plan)


# --- backtest --------------------------------------------------------------------------------------------


@router.post("/backtest", dependencies=[Depends(heavy_rate_limit)])
def backtest(req: BacktestRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
             snap: MarketSnapshot = Depends(get_snapshot)):
    prefs = A.preferences(user)
    ctx = A.resolve(db, user, snap, req)
    tickers = [t for t in ctx.tickers if t != CASH]
    prices = snap.adjusted[tickers]
    if req.start_date:
        prices = prices.loc[pd.Timestamp(req.start_date) - pd.Timedelta(days=int(req.estimation_window * 1.6)):]
    max_w = _effective_max_weight(req.max_single_asset, prefs, len(tickers))
    try:
        res = walk_forward_backtest(
            prices, list(req.strategies), benchmark_prices=snap.adjusted.get("SPY"),
            lookback=req.estimation_window, frequency=req.frequency,
            cost_rate=req.cost_rate if req.cost_rate is not None else prefs["cost_rate"],
            constraints=Constraints(max_weight=max_w), risk_free_rate=float(A.setting(req, "risk_free_rate", prefs)),
            sectors=_sectors(snap, tickers), return_method=A.setting(req, "return_method", prefs),
            cov_method=A.setting(req, "cov_method", prefs), custom_weights=ctx.weights, initial_capital=ctx.capital)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    res["max_single_asset"] = max_w
    res["tickers"] = tickers
    res["data"] = {"source": snap.source}
    # Keep the payload small: drop per-rebalance weights except for the last few entries.
    for log in res["rebalances"].values():
        for entry in log[:-3]:
            entry.pop("weights", None)
    return A.sanitize(res)


# --- what-if ----------------------------------------------------------------------------------------------


@router.post("/what-if")
def whatif(req: WhatIfRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
           snap: MarketSnapshot = Depends(get_snapshot)):
    prefs = A.preferences(user)
    p = A.get_owned_portfolio(db, user, req.portfolio_id)
    if not p.holdings:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This portfolio has no holdings yet.")
    action = req.action.model_dump()
    if action.get("ticker"):
        action["ticker"] = action["ticker"].strip().upper()
    if req.action.type == "rebalance_to" and req.action.run_id and not req.action.weights:
        action["weights"] = A.get_owned_run(db, user, req.action.run_id).result["optimized"]["weights"]
    if req.action.type in ("asset_shock", "market_shock") and req.action.shock is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "shock is required")
    if req.action.type == "reduce_holding" and req.action.percentage_points is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "percentage_points is required")
    if req.action.type == "add_cash" and req.action.amount is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "amount is required")
    tickers = [h.ticker for h in p.holdings]
    extra = []
    if action.get("ticker") and action["ticker"] not in tickers:
        extra.append(action["ticker"])
    extra += [t for t in (action.get("weights") or {}) if t not in tickers and t != CASH]
    try:
        universe = snap.require(tickers + extra)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    inp = A.build_inputs(snap, universe, req, prefs)
    betas = asset_betas(inp.returns, inp.bench)["beta"].to_dict() if inp.bench is not None else {}
    prices = {t: snap.latest_price(t) for t in universe}
    try:
        res = what_if(action, {h.ticker: h.quantity for h in p.holdings},
                      {h.ticker: h.quantity * h.average_cost for h in p.holdings}, prices, inp.returns, inp.mu, inp.cov,
                      risk_free_rate=inp.rf, benchmark_returns=inp.bench, betas=betas,
                      cost_rate=req.cost_rate if req.cost_rate is not None else prefs["cost_rate"])
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    res["inputs"] = inp.meta()
    res = A.sanitize(res)
    if req.save:
        sc = SavedScenario(user_id=user.id, portfolio_id=p.id, name=req.name or res["description"][:120],
                           kind="what_if", config=A.sanitize(action),
                           summary={"pnl": res["pnl"], "pct_change": res["pct_change"], "value_after": res["value_after"]})
        db.add(sc)
        db.commit()
        res["scenario_id"] = sc.id
    return res
