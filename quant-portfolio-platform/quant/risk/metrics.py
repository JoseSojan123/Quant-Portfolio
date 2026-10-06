"""Portfolio mathematics and risk measures (blueprint Stages 4, 6, 7; KB sections 5-8).

E[R_p]   = w' mu
sigma_p^2 = w' Sigma w
Sharpe   = (E[R_p] - R_f) / sigma_p
RC_i     = w_i (Sigma w)_i / sigma_p          (sum_i RC_i = sigma_p)
Drawdown = V_t / max(V_0..V_t) - 1
VaR_c    = -quantile(returns, 1 - c)          (reported as a positive loss)
ES_c     = -mean(returns | returns <= -VaR_c)
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats

from quant import TRADING_DAYS

# --- core portfolio formulas ----------------------------------------------------


def portfolio_return(weights: np.ndarray, mu: np.ndarray) -> float:
    return float(np.asarray(weights) @ np.asarray(mu))


def portfolio_variance(weights: np.ndarray, cov: np.ndarray) -> float:
    w = np.asarray(weights)
    return float(max(w @ np.asarray(cov) @ w, 0.0))


def portfolio_volatility(weights: np.ndarray, cov: np.ndarray) -> float:
    return float(np.sqrt(portfolio_variance(weights, cov)))


def sharpe_ratio(expected_return: float, volatility: float, risk_free_rate: float = 0.0) -> float:
    if volatility <= 1e-12:
        return float("nan")
    return float((expected_return - risk_free_rate) / volatility)


def portfolio_returns(returns: pd.DataFrame, weights: pd.Series | dict) -> pd.Series:
    """Daily returns of a constant-weight (daily rebalanced) portfolio."""
    w = pd.Series(weights, dtype=float).reindex(returns.columns).fillna(0.0)
    return returns @ w


# --- risk decomposition -----------------------------------------------------------


def risk_contribution(weights: np.ndarray, cov: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Absolute and percentage risk contributions.

    Returns ``(rc, pct)`` where ``rc.sum() == sigma_p`` and ``pct.sum() == 1``.
    """
    w = np.asarray(weights, dtype=float)
    cov = np.asarray(cov, dtype=float)
    sigma = portfolio_volatility(w, cov)
    if sigma <= 1e-12:
        return np.zeros_like(w), np.zeros_like(w)
    marginal = cov @ w / sigma
    rc = w * marginal
    return rc, rc / sigma


def concentration(weights: np.ndarray) -> dict:
    """Herfindahl index, effective number of holdings and top-weight shares."""
    w = np.abs(np.asarray(weights, dtype=float))
    total = w.sum()
    if total <= 0:
        return {"hhi": 0.0, "effective_n": 0.0, "top1": 0.0, "top3": 0.0, "top5": 0.0}
    w = w / total
    hhi = float((w**2).sum())
    s = np.sort(w)[::-1]
    return {"hhi": hhi, "effective_n": 1.0 / hhi, "top1": float(s[:1].sum()),
            "top3": float(s[:3].sum()), "top5": float(s[:5].sum())}


# --- drawdown ------------------------------------------------------------------------


def drawdown_series(values: pd.Series) -> pd.Series:
    peak = values.cummax()
    return values / peak - 1.0


def max_drawdown(values: pd.Series) -> float:
    if len(values) == 0:
        return 0.0
    return float(min(drawdown_series(values).min(), 0.0))


def drawdown_details(values: pd.Series) -> dict:
    """Max drawdown with its peak/trough/recovery dates and durations (trading days)."""
    dd = drawdown_series(values)
    if dd.empty:
        return {"max_drawdown": 0.0, "peak_date": None, "trough_date": None, "recovery_date": None,
                "max_duration_days": 0, "current_drawdown": 0.0, "current_duration_days": 0}
    trough = dd.idxmin()
    peak = values.loc[:trough].idxmax()
    after = values.loc[trough:]
    recovered = after[after >= values.loc[peak]]
    recovery = recovered.index[0] if len(recovered) else None
    underwater = dd < 0
    runs = underwater.groupby((~underwater).cumsum()).cumsum()
    return {
        "max_drawdown": float(dd.min()),
        "peak_date": _iso(peak), "trough_date": _iso(trough), "recovery_date": _iso(recovery),
        "max_duration_days": int(runs.max()) if len(runs) else 0,
        "current_drawdown": float(dd.iloc[-1]),
        "current_duration_days": int(runs.iloc[-1]),
    }


def _iso(x):
    if x is None:
        return None
    return pd.Timestamp(x).date().isoformat()


# --- VaR / Expected Shortfall -------------------------------------------------------


def horizon_returns(returns: pd.Series, horizon_days: int = 1) -> pd.Series:
    """Overlapping compounded ``horizon_days`` returns (identity for 1 day)."""
    if horizon_days <= 1:
        return returns.dropna()
    return np.expm1(np.log1p(returns).rolling(horizon_days).sum()).dropna()


def historical_var(returns: pd.Series | np.ndarray, confidence: float = 0.95) -> float:
    """Historical VaR as a positive loss fraction (linear-interpolated percentile)."""
    r = np.asarray(returns, dtype=float)
    r = r[~np.isnan(r)]
    if r.size == 0:
        return float("nan")
    return float(-np.quantile(r, 1.0 - confidence))


def historical_es(returns: pd.Series | np.ndarray, confidence: float = 0.95) -> float:
    """Average loss of the observations at or beyond the historical VaR threshold."""
    r = np.asarray(returns, dtype=float)
    r = r[~np.isnan(r)]
    if r.size == 0:
        return float("nan")
    threshold = np.quantile(r, 1.0 - confidence)
    tail = r[r <= threshold]
    return float(-tail.mean())


def parametric_var(mu: float, sigma: float, confidence: float = 0.95) -> float:
    """Normal (variance-covariance) VaR for a horizon whose mean/vol are ``mu``/``sigma``."""
    z = stats.norm.ppf(1.0 - confidence)
    return float(-(mu + z * sigma))


def parametric_es(mu: float, sigma: float, confidence: float = 0.95) -> float:
    """Normal Expected Shortfall: -(mu - sigma * phi(z) / (1 - c))."""
    z = stats.norm.ppf(1.0 - confidence)
    return float(-(mu - sigma * stats.norm.pdf(z) / (1.0 - confidence)))


# --- benchmark-relative ---------------------------------------------------------------


def beta_alpha(asset: pd.Series, benchmark: pd.Series) -> dict:
    """OLS of daily asset returns on benchmark returns: R_a = alpha + beta R_b + e."""
    df = pd.concat([asset, benchmark], axis=1).dropna()
    if len(df) < 3:
        return {"beta": float("nan"), "alpha": float("nan"), "r_squared": float("nan"), "residual_vol": float("nan")}
    y, x = df.iloc[:, 0].to_numpy(), df.iloc[:, 1].to_numpy()
    var_x = x.var(ddof=1)
    beta = float(np.cov(y, x, ddof=1)[0, 1] / var_x) if var_x > 0 else float("nan")
    alpha_d = float(y.mean() - beta * x.mean())
    resid = y - (alpha_d + beta * x)
    ss_tot = ((y - y.mean()) ** 2).sum()
    r2 = float(1 - (resid**2).sum() / ss_tot) if ss_tot > 0 else float("nan")
    return {"beta": beta, "alpha": alpha_d * TRADING_DAYS, "r_squared": r2,
            "residual_vol": float(resid.std(ddof=1) * np.sqrt(TRADING_DAYS))}


def tracking_error(portfolio: pd.Series, benchmark: pd.Series) -> float:
    active = (portfolio - benchmark).dropna()
    return float(active.std(ddof=1) * np.sqrt(TRADING_DAYS))


def information_ratio(portfolio: pd.Series, benchmark: pd.Series) -> float:
    active = (portfolio - benchmark).dropna()
    te = active.std(ddof=1) * np.sqrt(TRADING_DAYS)
    return float(active.mean() * TRADING_DAYS / te) if te > 0 else float("nan")


def sortino_ratio(returns: pd.Series, risk_free_rate: float = 0.0) -> float:
    r = returns.dropna()
    downside = np.minimum(r - risk_free_rate / TRADING_DAYS, 0.0)
    dd = np.sqrt((downside**2).mean()) * np.sqrt(TRADING_DAYS)
    return float((r.mean() * TRADING_DAYS - risk_free_rate) / dd) if dd > 0 else float("nan")


# --- full report -------------------------------------------------------------------------


@dataclass
class RiskReport:
    expected_return: float
    volatility: float
    sharpe: float
    sortino: float
    max_drawdown: float
    var_hist: float
    es_hist: float
    var_param: float
    es_param: float
    confidence: float
    horizon_days: int
    beta: float | None
    tracking_error: float | None
    information_ratio: float | None
    realized_return: float
    observations: int

    def as_dict(self) -> dict:
        return {k: (None if isinstance(v, float) and not np.isfinite(v) else v) for k, v in self.__dict__.items()}


def risk_report(
    returns: pd.DataFrame,
    weights: pd.Series | dict,
    mu: np.ndarray,
    cov: np.ndarray,
    risk_free_rate: float = 0.0,
    confidence: float = 0.95,
    horizon_days: int = 1,
    benchmark: pd.Series | None = None,
) -> RiskReport:
    """Ex-ante (mu/Sigma) and historical (constant current weights) risk summary.

    ``mu`` and ``cov`` are annualized and ordered like ``returns.columns``.
    """
    w = pd.Series(weights, dtype=float).reindex(returns.columns).fillna(0.0)
    wv = w.to_numpy()
    exp_ret = portfolio_return(wv, mu)
    vol = portfolio_volatility(wv, cov)
    pr = portfolio_returns(returns, w)
    hr = horizon_returns(pr, horizon_days)
    mu_h = exp_ret * horizon_days / TRADING_DAYS
    sd_h = vol * np.sqrt(horizon_days / TRADING_DAYS)
    beta = te = ir = None
    if benchmark is not None:
        b = benchmark.reindex(pr.index)
        beta = beta_alpha(pr, b)["beta"]
        te = tracking_error(pr, b)
        ir = information_ratio(pr, b)
    values = (1 + pr).cumprod()
    return RiskReport(
        expected_return=exp_ret, volatility=vol, sharpe=sharpe_ratio(exp_ret, vol, risk_free_rate),
        sortino=sortino_ratio(pr, risk_free_rate), max_drawdown=max_drawdown(values),
        var_hist=historical_var(hr, confidence), es_hist=historical_es(hr, confidence),
        var_param=parametric_var(mu_h, sd_h, confidence), es_param=parametric_es(mu_h, sd_h, confidence),
        confidence=confidence, horizon_days=horizon_days, beta=beta, tracking_error=te, information_ratio=ir,
        realized_return=float(values.iloc[-1] - 1) if len(values) else 0.0, observations=int(len(pr)),
    )
