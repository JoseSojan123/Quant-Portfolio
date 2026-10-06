"""Tests for the optimizer constraints, simulation, stress, rebalancing and backtest integrity."""

import numpy as np
import pandas as pd
import pytest

from quant.backtest.walk_forward import rebalance_dates, walk_forward_backtest
from quant.optimization.estimators import estimate_covariance, estimate_expected_returns
from quant.optimization.optimizer import CASH, Constraints, OptimizationError, efficient_frontier, optimize
from quant.rebalancing.rebalance import rebalance_plan, transaction_cost, turnover
from quant.simulation.monte_carlo import run_monte_carlo
from quant.stress.scenarios import SCENARIOS_BY_ID, custom_scenario, run_stress_test

SECTORS = {"AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology", "JPM": "Financials", "XOM": "Energy"}
META = {t: {"sector": s, "tags": []} for t, s in SECTORS.items()}


@pytest.fixture(scope="module")
def inputs(returns5):
    return estimate_expected_returns(returns5), estimate_covariance(returns5)


def _check_basic(res, max_w=1.0, lo=0.0):
    w = res.weights
    assert w.sum() == pytest.approx(1.0, abs=1e-6)
    assert (w >= lo - 1e-6).all()
    assert (w.drop(CASH, errors="ignore") <= max_w + 1e-6).all()


@pytest.mark.parametrize("objective", ["min_variance", "max_sharpe", "risk_parity", "equal_weight"])
def test_weights_sum_to_one_and_respect_bounds(inputs, objective):
    mu, cov = inputs
    res = optimize(mu, cov, objective, Constraints(max_weight=0.4), 0.04, SECTORS)
    _check_basic(res, 0.4)


def test_min_variance_is_lowest_variance(inputs):
    mu, cov = inputs
    mv = optimize(mu, cov, "min_variance", Constraints(), 0.04)
    rng = np.random.default_rng(1)
    for _ in range(300):
        w = rng.dirichlet(np.ones(5))
        assert w @ cov.to_numpy() @ w >= mv.volatility**2 - 1e-10


def test_max_sharpe_beats_random_portfolios(inputs):
    mu, cov = inputs
    ms = optimize(mu, cov, "max_sharpe", Constraints(max_weight=0.4), 0.04)
    rng = np.random.default_rng(2)
    for _ in range(300):
        w = rng.dirichlet(np.ones(5))
        if w.max() > 0.4:
            continue
        s = (w @ mu.to_numpy() - 0.04) / np.sqrt(w @ cov.to_numpy() @ w)
        assert ms.sharpe >= s - 1e-6


def test_target_return_constraint(inputs):
    mu, cov = inputs
    target = float(mu.median())
    res = optimize(mu, cov, "target_return", Constraints(target_return=target), 0.04)
    assert res.expected_return >= target - 1e-6


def test_target_return_infeasible(inputs):
    mu, cov = inputs
    with pytest.raises(OptimizationError):
        optimize(mu, cov, "target_return", Constraints(target_return=float(mu.max()) + 0.5), 0.04)


def test_infeasible_max_weight(inputs):
    mu, cov = inputs
    with pytest.raises(OptimizationError):
        optimize(mu, cov, "min_variance", Constraints(max_weight=0.15))


def test_sector_cap(inputs):
    mu, cov = inputs
    res = optimize(mu, cov, "max_sharpe", Constraints(max_weight=0.6, sector_caps={"Technology": 0.4}), 0.04, SECTORS)
    tech = sum(res.weights[t] for t in ["AAPL", "MSFT", "NVDA"])
    assert tech <= 0.4 + 1e-6


def test_cash_floor(inputs):
    mu, cov = inputs
    res = optimize(mu, cov, "min_variance", Constraints(cash_floor=0.05), 0.04)
    assert res.weights[CASH] == pytest.approx(0.05, abs=1e-6)
    _check_basic(res)


def test_minimum_holding(inputs):
    mu, cov = inputs
    res = optimize(mu, cov, "max_sharpe", Constraints(max_weight=0.5, min_weight=0.1), 0.04)
    held = res.weights[res.weights > 1e-6]
    assert (held >= 0.1 - 1e-6).all()


def test_turnover_cap(inputs):
    mu, cov = inputs
    current = {"AAPL": 0.2, "MSFT": 0.2, "NVDA": 0.2, "JPM": 0.2, "XOM": 0.2}
    res = optimize(mu, cov, "max_sharpe", Constraints(turnover_cap=0.2, current_weights=current), 0.04)
    assert res.turnover <= 0.2 + 1e-6


def test_risk_parity_equalizes_risk(inputs):
    mu, cov = inputs
    res = optimize(mu, cov, "risk_parity", Constraints(), 0.04)
    assert res.risk_contribution.max() - res.risk_contribution.min() < 1e-3


def test_efficient_frontier_monotone(inputs):
    mu, cov = inputs
    ef = efficient_frontier(mu, cov, Constraints(max_weight=0.5), 0.04, n_points=15, n_random=100)
    rets = [p["expected_return"] for p in ef["frontier"]]
    vols = [p["volatility"] for p in ef["frontier"]]
    assert len(rets) >= 10
    assert all(b >= a - 1e-9 for a, b in zip(rets, rets[1:], strict=False))
    assert all(b >= a - 1e-6 for a, b in zip(vols, vols[1:], strict=False))
    assert ef["min_variance"]["volatility"] <= min(vols) + 1e-6


def test_optimizer_result_is_json_serializable(inputs):
    import json

    mu, cov = inputs
    res = optimize(mu, cov, "max_sharpe", Constraints(max_weight=0.4), 0.04)
    json.dumps(res.as_dict())


# --- Monte Carlo -------------------------------------------------------------------------------

def test_monte_carlo_matches_analytic_mean(inputs, returns5):
    mu, cov = inputs
    w = pd.Series(0.2, index=mu.index)
    res = run_monte_carlo(w, mu, cov, initial_value=100.0, horizon_days=21, n_sims=20000, seed=3)
    # Buy-and-hold: E[terminal] = sum_i w_i * V0 * (1 + mu_i/252)^H
    expected = 100 * sum(0.2 * (1 + mu[t] / 252) ** 21 for t in mu.index)
    assert res["terminal"]["mean"] == pytest.approx(expected, rel=0.01)
    assert 0 <= res["prob_loss"] <= 1
    assert res["es_95"] >= res["var_95"]


def test_monte_carlo_bootstrap_and_limits(inputs, returns5):
    mu, cov = inputs
    w = pd.Series(0.2, index=mu.index)
    res = run_monte_carlo(w, mu, cov, n_sims=500, horizon_days=10, method="bootstrap", historical_returns=returns5)
    assert len(res["bands"]) > 1
    with pytest.raises(ValueError):
        run_monte_carlo(w, mu, cov, n_sims=10_000_000, horizon_days=2520)


# --- stress ----------------------------------------------------------------------------------------

def test_tech_selloff_matches_kb_example():
    weights = {"AAPL": 0.2, "MSFT": 0.2, "JPM": 0.3, "XOM": 0.3}  # 40% technology
    res = run_stress_test(SCENARIOS_BY_ID["tech_selloff"], weights, 100_000, META)
    assert res["pnl"] == pytest.approx(-0.4 * 0.25 * 100_000)
    assert res["value_after"] == pytest.approx(90_000)
    assert {c["ticker"] for c in res["largest_contributors"]} == {"AAPL", "MSFT"}


def test_market_crash_uses_beta():
    res = run_stress_test(SCENARIOS_BY_ID["market_crash"], {"AAPL": 0.5, "XOM": 0.5}, 1000, META,
                          betas={"AAPL": 1.2, "XOM": 0.8})
    assert res["pct_change"] == pytest.approx(-0.20)


def test_historical_replay(synthetic_prices):
    res = run_stress_test(SCENARIOS_BY_ID["covid_2020"], {"SPY": 1.0}, 1000, {"SPY": {"sector": "Broad Market"}},
                          prices=synthetic_prices)
    p = synthetic_prices["SPY"]
    expected = p.loc["2020-03-23"] / p.loc["2020-02-19"] - 1
    assert res["pct_change"] == pytest.approx(expected)


def test_custom_scenario():
    sc = custom_scenario({"nvda": -0.3})
    res = run_stress_test(sc, {"NVDA": 0.5, "JPM": 0.5}, 200, META)
    assert res["pnl"] == pytest.approx(-30)


# --- rebalancing ---------------------------------------------------------------------------------

def test_turnover_and_cost():
    current = {"AAPL": 0.18, "MSFT": 0.24, "NVDA": 0.29, "JPM": 0.16, "XOM": 0.13}
    target = dict.fromkeys(current, 0.2)
    to = turnover(current, target)
    assert to == pytest.approx(0.02 + 0.04 + 0.09 + 0.04 + 0.07)
    assert transaction_cost(to, 0.001, 100_000) == pytest.approx(to * 0.001 * 100_000)
    plan = rebalance_plan(current, target, 100_000, cost_rate=0.001, threshold=0.05)
    assert plan["rebalance_recommended"]
    assert plan["estimated_cost"] == pytest.approx(26.0)


def test_rebalance_threshold_blocks_small_drift():
    plan = rebalance_plan({"A": 0.52, "B": 0.48}, {"A": 0.5, "B": 0.5}, 10_000, threshold=0.05)
    assert not plan["rebalance_recommended"]
    assert plan["turnover"] == 0 and plan["estimated_cost"] == 0


def test_whole_share_trades():
    plan = rebalance_plan({"A": 0.7, "B": 0.3}, {"A": 0.5, "B": 0.5}, 10_000, prices={"A": 300, "B": 7}, force=True,
                          whole_shares=True)
    a = next(t for t in plan["trades"] if t["ticker"] == "A")
    assert a["shares"] == -6 and a["action"] == "sell"


# --- backtest integrity --------------------------------------------------------------------------

def test_backtest_has_no_lookahead_and_applies_costs(synthetic_prices):
    p = synthetic_prices[["AAPL", "MSFT", "JPM", "XOM"]].loc["2022-01-01":]
    res = walk_forward_backtest(p, ["equal_weight", "min_variance"], benchmark_prices=synthetic_prices["SPY"].loc["2022-01-01":],
                                lookback=126, frequency="quarterly", cost_rate=0.002)
    assert res["integrity"]["no_lookahead"]
    for log in res["rebalances"].values():
        for entry in log:
            if "window_end" in entry:
                assert entry["window_end"] < entry["date"]
    # Rebalance dates are the first trading day of each quarter.
    for d in res["integrity"]["rebalance_dates"]:
        assert pd.Timestamp(d).month in (1, 4, 7, 10)
    assert res["metrics"]["equal_weight"]["total_costs"] > 0
    # Every curve covers the same evaluation window.
    assert all(set(row) >= {"equal_weight", "min_variance", "benchmark"} for row in res["series"])


def test_backtest_costs_reduce_returns(synthetic_prices):
    p = synthetic_prices[["AAPL", "MSFT", "JPM", "XOM"]].loc["2022-01-01":]
    cheap = walk_forward_backtest(p, ["max_sharpe"], lookback=126, frequency="monthly", cost_rate=0.0)
    costly = walk_forward_backtest(p, ["max_sharpe"], lookback=126, frequency="monthly", cost_rate=0.01)
    assert costly["metrics"]["max_sharpe"]["final_value"] < cheap["metrics"]["max_sharpe"]["final_value"]


def test_rebalance_dates_after_lookback():
    idx = pd.bdate_range("2023-01-02", "2023-12-29")
    dates = rebalance_dates(idx, "monthly", 60)
    assert dates[0] >= idx[60]
    assert len({(d.year, d.month) for d in dates}) == len(dates)
