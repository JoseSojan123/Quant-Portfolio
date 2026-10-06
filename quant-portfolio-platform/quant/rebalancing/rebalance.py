"""Rebalancing, turnover and transaction costs (blueprint Stage 11, KB section 11).

Drift            current_weight - target_weight
Turnover         sum_i |target_i - current_i|      (two-sided: buys + sells)
One-way turnover turnover / 2                      (the amount bought == amount sold)
Cost             turnover x cost_rate x portfolio_value

Threshold rule: rebalance only when the largest absolute drift exceeds the
threshold (e.g. 5 percentage points). When triggered, every position is traded
back to target; otherwise no trades are proposed.
"""

from __future__ import annotations

import math


def turnover(current: dict[str, float], target: dict[str, float]) -> float:
    keys = set(current) | set(target)
    return float(sum(abs(target.get(k, 0.0) - current.get(k, 0.0)) for k in keys))


def transaction_cost(turnover_value: float, cost_rate: float, portfolio_value: float) -> float:
    return float(turnover_value * cost_rate * portfolio_value)


def rebalance_plan(
    current: dict[str, float],
    target: dict[str, float],
    portfolio_value: float,
    prices: dict[str, float] | None = None,
    cost_rate: float = 0.001,
    threshold: float = 0.05,
    whole_shares: bool = False,
    force: bool = False,
) -> dict:
    prices = prices or {}
    keys = sorted(set(current) | set(target), key=lambda k: -max(current.get(k, 0), target.get(k, 0)))
    drifts = {k: current.get(k, 0.0) - target.get(k, 0.0) for k in keys}
    max_drift = max((abs(v) for v in drifts.values()), default=0.0)
    triggered = force or max_drift > threshold + 1e-12

    rows = []
    for k in keys:
        cw, tw = current.get(k, 0.0), target.get(k, 0.0)
        trade_w = (tw - cw) if triggered else 0.0
        trade_value = trade_w * portfolio_value
        price = prices.get(k) or (1.0 if k == "CASH" else None)
        shares = None
        if price:
            shares = trade_value / price
            if whole_shares and k != "CASH":
                shares = float(math.floor(abs(shares)) * (1 if shares >= 0 else -1))
                trade_value = shares * price
                trade_w = trade_value / portfolio_value if portfolio_value else 0.0
        action = "hold" if abs(trade_value) < 0.005 else ("buy" if trade_value > 0 else "sell")
        rows.append({
            "ticker": k, "current_weight": cw, "target_weight": tw, "drift": drifts[k],
            "breach": abs(drifts[k]) > threshold + 1e-12,
            "trade_weight": trade_w, "trade_value": trade_value, "shares": shares, "price": price, "action": action,
        })
    to = float(sum(abs(r["trade_weight"]) for r in rows))
    cost = transaction_cost(to, cost_rate, portfolio_value)
    return {
        "rebalance_recommended": triggered and to > 1e-9,
        "max_drift": max_drift, "threshold": threshold,
        "turnover": to, "one_way_turnover": to / 2, "cost_rate": cost_rate, "estimated_cost": cost,
        "portfolio_value": portfolio_value, "value_after_costs": portfolio_value - cost,
        "trades": rows,
        "convention": ("Turnover = sum of |target - current| weights (buys + sells). "
                       "Cost = turnover x cost rate x portfolio value."),
    }
