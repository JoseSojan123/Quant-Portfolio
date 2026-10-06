"""Unit tests for the quantitative core (blueprint section 30: "Unit tests")."""

import numpy as np
import pandas as pd
import pytest

from quant import TRADING_DAYS
from quant.data.calendar import nyse_holidays, trading_days
from quant.data.validation import validate_prices
from quant.features.returns import cagr, cumulative_returns, log_returns, rolling_return, simple_returns
from quant.optimization.estimators import (
    bayes_stein_returns,
    correlation_from_covariance,
    ledoit_wolf_covariance,
    sample_covariance,
)
from quant.risk.metrics import (
    concentration,
    drawdown_details,
    drawdown_series,
    historical_es,
    historical_var,
    max_drawdown,
    parametric_es,
    parametric_var,
    portfolio_return,
    portfolio_variance,
    portfolio_volatility,
    risk_contribution,
    sharpe_ratio,
)

# --- returns ------------------------------------------------------------------------------

def test_simple_return_matches_blueprint_example():
    prices = pd.DataFrame({"AAPL": [100.0, 102.0], "MSFT": [200.0, 204.0]})
    r = simple_returns(prices)
    assert r.iloc[0]["AAPL"] == pytest.approx(0.02)
    assert r.iloc[0]["MSFT"] == pytest.approx(0.02)


def test_log_returns_add_across_time():
    p = pd.Series([100.0, 110.0, 99.0, 120.0])
    assert log_returns(p).sum() == pytest.approx(np.log(120 / 100))


def test_cumulative_return_compounds():
    r = pd.Series([0.10, -0.10])
    assert cumulative_returns(r).iloc[-1] == pytest.approx(1.1 * 0.9 - 1)


def test_rolling_return_window():
    r = pd.Series([0.1, 0.1, 0.1])
    assert rolling_return(r, 2).iloc[-1] == pytest.approx(1.1**2 - 1)


def test_cagr_two_years():
    values = pd.Series(np.linspace(100, 121, 2 * TRADING_DAYS + 1))
    values.iloc[-1] = 121.0
    assert cagr(values) == pytest.approx(0.10, abs=1e-9)


# --- portfolio math -------------------------------------------------------------------------

def test_known_portfolio_return_and_variance():
    w = np.array([0.4, 0.4, 0.2])
    mu = np.array([0.10, 0.12, 0.08])
    cov = np.array([[0.04, 0.01, 0.0], [0.01, 0.09, 0.02], [0.0, 0.02, 0.0225]])
    assert portfolio_return(w, mu) == pytest.approx(0.4 * 0.10 + 0.4 * 0.12 + 0.2 * 0.08)
    expected_var = w @ cov @ w
    assert portfolio_variance(w, cov) == pytest.approx(expected_var)
    # Covariance matters: the naive weighted-average volatility overstates risk here.
    naive = 0.4 * 0.2 + 0.4 * 0.3 + 0.2 * 0.15
    assert portfolio_volatility(w, cov) < naive


def test_portfolio_variance_non_negative(returns5):
    cov = sample_covariance(returns5).to_numpy()
    rng = np.random.default_rng(0)
    for _ in range(200):
        w = rng.normal(size=5)
        assert portfolio_variance(w, cov) >= 0


def test_sharpe_ratio():
    assert sharpe_ratio(0.12, 0.2, 0.02) == pytest.approx(0.5)
    assert np.isnan(sharpe_ratio(0.1, 0.0))


def test_risk_contributions_sum_to_volatility(returns5):
    cov = sample_covariance(returns5).to_numpy()
    w = np.array([0.3, 0.2, 0.2, 0.15, 0.15])
    rc, pct = risk_contribution(w, cov)
    assert rc.sum() == pytest.approx(portfolio_volatility(w, cov))
    assert pct.sum() == pytest.approx(1.0)


def test_concentration_equal_weight():
    c = concentration(np.full(4, 0.25))
    assert c["hhi"] == pytest.approx(0.25)
    assert c["effective_n"] == pytest.approx(4.0)


# --- drawdown ---------------------------------------------------------------------------

def test_drawdown_never_exceeds_zero(returns5):
    values = (1 + returns5.mean(axis=1)).cumprod()
    dd = drawdown_series(values)
    assert (dd <= 1e-12).all()
    assert max_drawdown(values) <= 0


def test_max_drawdown_known_path():
    values = pd.Series([100, 120, 90, 130, 104], index=pd.date_range("2024-01-01", periods=5))
    assert max_drawdown(values) == pytest.approx(90 / 120 - 1)
    d = drawdown_details(values)
    assert d["peak_date"] == "2024-01-02" and d["trough_date"] == "2024-01-03" and d["recovery_date"] == "2024-01-04"
    assert d["current_drawdown"] == pytest.approx(104 / 130 - 1)


# --- VaR / ES -------------------------------------------------------------------------------

def test_historical_var_percentile():
    r = np.arange(-50, 50) / 1000.0  # -5.0% ... +4.9%, 100 observations
    assert historical_var(r, 0.95) == pytest.approx(-np.quantile(r, 0.05))
    assert historical_var(r, 0.95) == pytest.approx(0.04505, abs=1e-9)


def test_expected_shortfall_beyond_var():
    r = np.arange(-50, 50) / 1000.0
    var = historical_var(r, 0.95)
    es = historical_es(r, 0.95)
    assert es >= var
    assert es == pytest.approx(-r[r <= -var].mean())


def test_parametric_var_and_es_normal():
    var = parametric_var(0.0, 0.01, 0.95)
    es = parametric_es(0.0, 0.01, 0.95)
    assert var == pytest.approx(0.0164485, rel=1e-4)
    assert es == pytest.approx(0.0206271, rel=1e-4)


# --- estimators ------------------------------------------------------------------------------

def test_covariance_symmetric_and_psd(returns5):
    for cov in (sample_covariance(returns5), ledoit_wolf_covariance(returns5)[0]):
        m = cov.to_numpy()
        assert np.allclose(m, m.T)
        assert (np.diag(m) >= 0).all()
        assert np.linalg.eigvalsh(m).min() > -1e-12


def test_ledoit_wolf_intensity_in_unit_interval(returns5):
    _, s = ledoit_wolf_covariance(returns5)
    assert 0 <= s <= 1


def test_bayes_stein_shrinks_dispersion(returns5):
    shrunk, intensity = bayes_stein_returns(returns5)
    hist = returns5.mean() * TRADING_DAYS
    assert 0 <= intensity <= 1
    assert shrunk.std() <= hist.std() + 1e-12


def test_correlation_bounds(returns5):
    corr = correlation_from_covariance(sample_covariance(returns5)).to_numpy()
    assert np.allclose(np.diag(corr), 1)
    assert corr.max() <= 1 + 1e-12 and corr.min() >= -1 - 1e-12


# --- data -----------------------------------------------------------------------------------------

def test_validation_removes_duplicates_and_bad_prices():
    raw = pd.DataFrame({
        "date": ["2024-01-02", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"],
        "ticker": ["aapl ", "AAPL", "AAPL", "AAPL", "AAPL"],
        "adjusted_close": [100.0, 101.0, None, -5.0, 102.0],
    })
    clean, rep = validate_prices(raw)
    assert rep.duplicates_removed == 1
    assert rep.missing_prices_removed == 1
    assert rep.non_positive_removed == 1
    assert clean["ticker"].unique().tolist() == ["AAPL"]
    assert clean.loc[clean["date"] == "2024-01-02", "adjusted_close"].item() == 101.0


def test_trading_calendar_excludes_holidays():
    days = trading_days("2024-12-20", "2025-01-10")
    dates = {d.date().isoformat() for d in days}
    assert "2024-12-25" not in dates and "2025-01-01" not in dates and "2025-01-09" not in dates
    assert "2024-12-24" in dates
    assert any(h.isoformat() == "2025-04-18" for h in nyse_holidays(2025))  # Good Friday
