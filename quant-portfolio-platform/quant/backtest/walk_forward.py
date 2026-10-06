"""Walk-forward backtest of the portfolio-construction process (blueprint Stage 12, KB section 16).

For each rebalance date t:
  1. take only returns strictly before t (the last ``lookback`` days),
  2. estimate mu and Sigma,
  3. optimize weights,
  4. pay transaction costs on the turnover from the drifted weights,
  5. hold (and let weights drift) until the next rebalance date,
  6. record realized daily returns.

Weights chosen at t use data through the previous close and earn day t's return
onward, so no future observation is ever used. Every strategy and the benchmark
are evaluated over exactly the same window and pay the same cost rate
(including the initial purchase).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant import TRADING_DAYS
from quant.features.returns import cagr
from quant.optimization.estimators import estimate_covariance, estimate_expected_returns
from quant.optimization.optimizer import CASH, Constraints, OptimizationError, optimize
from quant.risk.metrics import drawdown_series, max_drawdown

STRATEGIES = ("equal_weight", "min_variance", "max_sharpe", "risk_parity", "current")
STRATEGY_LABELS = {
    "equal_weight": "Equal weight", "min_variance": "Minimum variance", "max_sharpe": "Maximum Sharpe",
    "risk_parity": "Risk parity", "current": "Current weights (rebalanced)", "benchmark": "Benchmark buy & hold",
}


def rebalance_dates(index: pd.DatetimeIndex, frequency: str, lookback: int) -> list[pd.Timestamp]:
    if frequency not in ("monthly", "quarterly", "annual"):
        raise ValueError("frequency must be monthly, quarterly or annual")
    eligible = index[lookback:]
    if len(eligible) == 0:
        return []
    s = pd.Series(eligible, index=eligible)
    key = {"monthly": [eligible.year, eligible.month],
           "quarterly": [eligible.year, eligible.quarter],
           "annual": [eligible.year]}[frequency]
    firsts = s.groupby(key).first()
    return list(pd.DatetimeIndex(firsts.values))


def _target_weights(strategy: str, window: pd.DataFrame, constraints: Constraints, rf: float,
                    sectors: dict[str, str], return_method: str, cov_method: str,
                    custom: dict[str, float] | None) -> tuple[pd.Series, str | None]:
    tickers = list(window.columns)
    if strategy == "current":
        w = pd.Series({t: float((custom or {}).get(t, 0.0)) for t in tickers})
        if constraints.cash_floor > 0:
            w[CASH] = float((custom or {}).get(CASH, 0.0))
        return w / w.sum(), None
    mu = estimate_expected_returns(window, return_method)
    cov = estimate_covariance(window, cov_method)
    c = Constraints(long_only=True, max_weight=constraints.max_weight, min_weight=constraints.min_weight,
                    sector_caps=dict(constraints.sector_caps), cash_floor=constraints.cash_floor)
    res = optimize(mu, cov, strategy, c, rf, sectors)
    return res.weights, (res.warnings[0] if res.warnings else None)


def walk_forward_backtest(
    prices: pd.DataFrame,
    strategies: list[str],
    *,
    benchmark_prices: pd.Series | None = None,
    lookback: int = 252,
    frequency: str = "monthly",
    cost_rate: float = 0.001,
    constraints: Constraints | None = None,
    risk_free_rate: float = 0.0,
    sectors: dict[str, str] | None = None,
    return_method: str = "historical",
    cov_method: str = "sample",
    custom_weights: dict[str, float] | None = None,
    initial_capital: float = 100_000.0,
    max_points: int = 500,
) -> dict:
    constraints = constraints or Constraints()
    sectors = sectors or {}
    prices = prices.sort_index().dropna(how="any")
    rets = prices.pct_change(fill_method=None).iloc[1:]
    if benchmark_prices is not None:
        bench_r = benchmark_prices.sort_index().pct_change(fill_method=None).reindex(rets.index)
        valid = bench_r.notna()
        rets, bench_r = rets[valid], bench_r[valid]
    dates = rebalance_dates(rets.index, frequency, lookback)
    if len(dates) < 2:
        raise ValueError("not enough history for a backtest: need more than the lookback window plus two rebalance periods")
    start = dates[0]
    eval_idx = rets.index[rets.index >= start]
    rb_set = set(dates)
    rf_d = risk_free_rate / TRADING_DAYS
    tickers = list(rets.columns)

    curves: dict[str, pd.Series] = {}
    logs: dict[str, list[dict]] = {}
    metrics: dict[str, dict] = {}
    integrity_ok = True

    for strat in strategies:
        if strat not in STRATEGIES:
            raise ValueError(f"unknown strategy {strat!r}")
        if strat == "current" and not custom_weights:
            continue
        cols = tickers + ([CASH] if constraints.cash_floor > 0 else [])
        r_all = rets.copy()
        if CASH in cols:
            r_all[CASH] = rf_d
        r_mat = r_all[cols].loc[eval_idx].to_numpy()
        w = np.zeros(len(cols))
        value = 1.0
        vals = np.empty(len(eval_idx))
        log = []
        last_target = None
        for i, d in enumerate(eval_idx):
            if d in rb_set:
                window = rets.loc[rets.index < d].iloc[-lookback:]
                ok_window = window.index[-1] < d
                integrity_ok &= bool(ok_window)
                note = None
                try:
                    target, note = _target_weights(strat, window, constraints, risk_free_rate, sectors,
                                                   return_method, cov_method, custom_weights)
                    target = target.reindex(cols).fillna(0.0).to_numpy()
                except OptimizationError as exc:
                    target = last_target if last_target is not None else np.full(len(cols), 1.0 / len(cols))
                    note = f"optimizer failed ({exc}); kept previous weights"
                to = float(np.abs(target - w).sum())
                cost = cost_rate * to
                value *= (1.0 - cost)
                w = target.copy()
                last_target = target
                log.append({"date": d.date().isoformat(), "window_start": window.index[0].date().isoformat(),
                            "window_end": window.index[-1].date().isoformat(), "turnover": to,
                            "cost": cost * initial_capital * (value / (1 - cost)), "note": note,
                            "weights": {c: float(x) for c, x in zip(cols, w, strict=True) if abs(x) > 1e-6}})
            day = r_mat[i]
            rp = float(w @ day)
            value *= (1.0 + rp)
            vals[i] = value
            if 1.0 + rp > 0:
                w = w * (1.0 + day) / (1.0 + rp)
        curves[strat] = pd.Series(vals * initial_capital, index=eval_idx)
        logs[strat] = log

    if benchmark_prices is not None:
        bv = (1.0 - cost_rate) * (1.0 + bench_r.loc[eval_idx]).cumprod()
        curves["benchmark"] = bv * initial_capital
        logs["benchmark"] = [{"date": start.date().isoformat(), "turnover": 1.0, "cost": cost_rate * initial_capital}]

    for name, curve in curves.items():
        daily = curve.pct_change(fill_method=None).dropna()
        first = pd.concat([pd.Series([initial_capital], index=[eval_idx[0] - pd.Timedelta(days=1)]), curve])
        vol = float(daily.std(ddof=1) * np.sqrt(TRADING_DAYS))
        ann_ret = float(daily.mean() * TRADING_DAYS)
        c = cagr(first)
        mdd = max_drawdown(curve)
        lg = logs.get(name, [])
        tos = [x["turnover"] for x in lg[1:]]  # exclude the initial purchase
        metrics[name] = {
            "label": STRATEGY_LABELS.get(name, name),
            "final_value": float(curve.iloc[-1]), "total_return": float(curve.iloc[-1] / initial_capital - 1),
            "cagr": c, "volatility": vol,
            "sharpe": (ann_ret - risk_free_rate) / vol if vol > 0 else None,
            "max_drawdown": mdd, "calmar": (c / abs(mdd)) if mdd < 0 else None,
            "avg_turnover": float(np.mean(tos)) if tos else 0.0,
            "total_costs": float(sum(x["cost"] for x in lg)), "rebalances": len(lg),
        }

    # Downsample curves for charting.
    step = max(1, len(eval_idx) // max_points)
    pick = list(range(0, len(eval_idx), step))
    if pick[-1] != len(eval_idx) - 1:
        pick.append(len(eval_idx) - 1)
    series = []
    dd = {k: drawdown_series(v) for k, v in curves.items()}
    for i in pick:
        row = {"date": eval_idx[i].date().isoformat()}
        for k, v in curves.items():
            row[k] = float(v.iloc[i])
            row[f"{k}_dd"] = float(dd[k].iloc[i])
        series.append(row)

    return {
        "start": eval_idx[0].date().isoformat(), "end": eval_idx[-1].date().isoformat(),
        "lookback": lookback, "frequency": frequency, "cost_rate": cost_rate, "initial_capital": initial_capital,
        # The chart series is downsampled; this is the real length of the evaluation period.
        "observations": len(eval_idx), "risk_free_rate": risk_free_rate,
        "return_method": return_method, "cov_method": cov_method,
        "strategies": list(curves.keys()), "labels": {k: STRATEGY_LABELS.get(k, k) for k in curves},
        "metrics": metrics, "series": series,
        "rebalances": dict(logs),
        "integrity": {
            "no_lookahead": bool(integrity_ok),
            "estimation_windows_end_before_rebalance": bool(integrity_ok),
            "same_evaluation_window": True,
            "transaction_costs_applied": cost_rate > 0,
            "rebalance_dates": [d.date().isoformat() for d in dates],
        },
    }
