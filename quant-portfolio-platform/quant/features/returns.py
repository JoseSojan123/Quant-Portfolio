"""Returns engine (blueprint Stage 2, knowledge base section 3).

Simple return   R_t = P_t / P_{t-1} - 1
Log return      r_t = ln(P_t / P_{t-1})
Cumulative      (1 + R_1)(1 + R_2)...(1 + R_T) - 1
CAGR            (V_end / V_start)^(1 / years) - 1
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant import TRADING_DAYS


def align_prices(prices: pd.DataFrame) -> pd.DataFrame:
    """Keep only dates where every selected asset has a price.

    Different assets can have different histories. Rather than forward-filling
    (which invents prices), we use the common window so returns line up.
    """
    return prices.sort_index().dropna(how="any")


def simple_returns(prices: pd.DataFrame | pd.Series) -> pd.DataFrame | pd.Series:
    return prices.pct_change(fill_method=None).iloc[1:]


def log_returns(prices: pd.DataFrame | pd.Series) -> pd.DataFrame | pd.Series:
    return np.log(prices / prices.shift(1)).iloc[1:]


def cumulative_returns(returns: pd.DataFrame | pd.Series) -> pd.DataFrame | pd.Series:
    """Running compounded return from the first observation."""
    return (1.0 + returns).cumprod() - 1.0


def growth_of(returns: pd.Series, start_value: float = 1.0) -> pd.Series:
    """Value path of ``start_value`` invested at the first date."""
    return start_value * (1.0 + returns).cumprod()


def rolling_return(returns: pd.DataFrame | pd.Series, window: int) -> pd.DataFrame | pd.Series:
    """Compounded return over the trailing ``window`` observations."""
    return np.expm1(np.log1p(returns).rolling(window).sum())


def rolling_volatility(returns: pd.DataFrame | pd.Series, window: int = 63, annualize: bool = True):
    vol = returns.rolling(window).std(ddof=1)
    return vol * np.sqrt(TRADING_DAYS) if annualize else vol


def annualized_mean(returns: pd.DataFrame | pd.Series):
    """Arithmetic mean daily return x 252."""
    return returns.mean() * TRADING_DAYS


def annualized_volatility(returns: pd.DataFrame | pd.Series):
    """Daily standard deviation x sqrt(252)."""
    return returns.std(ddof=1) * np.sqrt(TRADING_DAYS)


def cagr(values: pd.Series, periods_per_year: int = TRADING_DAYS) -> float:
    """Compound annual growth rate of a value series sampled daily."""
    values = values.dropna()
    if len(values) < 2 or values.iloc[0] <= 0:
        return float("nan")
    years = (len(values) - 1) / periods_per_year
    if years <= 0:
        return float("nan")
    return float((values.iloc[-1] / values.iloc[0]) ** (1.0 / years) - 1.0)


def asset_statistics(returns: pd.DataFrame, risk_free_rate: float = 0.0) -> pd.DataFrame:
    """Per-asset summary statistics used across the UI."""
    from quant.risk.metrics import max_drawdown

    out = pd.DataFrame(index=returns.columns)
    out["annual_return"] = annualized_mean(returns)
    out["annual_volatility"] = annualized_volatility(returns)
    out["sharpe"] = (out["annual_return"] - risk_free_rate) / out["annual_volatility"].replace(0, np.nan)
    out["cagr"] = [cagr(growth_of(returns[c])) for c in returns.columns]
    out["max_drawdown"] = [max_drawdown(growth_of(returns[c])) for c in returns.columns]
    out["skew"] = returns.skew()
    out["kurtosis"] = returns.kurt()  # excess kurtosis (normal = 0)
    out["best_day"] = returns.max()
    out["worst_day"] = returns.min()
    out["observations"] = returns.count()
    return out
