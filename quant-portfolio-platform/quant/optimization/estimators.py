"""Estimating the optimizer inputs mu and Sigma (blueprint Stage 3).

Historical means are noisy, and that noise is the biggest weakness of
mean-variance optimization. Besides the plain historical estimate we therefore
offer shrinkage estimators that pull the inputs toward something more stable.

Expected returns (annualized)
  historical   mean(r) x 252
  bayes_stein  Jorion (1986): shrink each mean toward the minimum-variance
               portfolio's mean by a data-driven intensity
  capm         rf + beta_i x equity risk premium (equilibrium-style, ignores history)

Covariance (annualized)
  sample       sample covariance x 252
  ledoit_wolf  Ledoit & Wolf (2004) shrinkage toward a scaled identity
  ewma         RiskMetrics exponentially weighted covariance (lambda = 0.94)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant import TRADING_DAYS

RETURN_METHODS = ("historical", "bayes_stein", "capm")
COV_METHODS = ("sample", "ledoit_wolf", "ewma")


def sample_covariance(returns: pd.DataFrame) -> pd.DataFrame:
    return returns.cov(ddof=1) * TRADING_DAYS


def ledoit_wolf_covariance(returns: pd.DataFrame) -> tuple[pd.DataFrame, float]:
    """Shrunk covariance and the shrinkage intensity in [0, 1]."""
    x = returns.to_numpy(dtype=float)
    t, n = x.shape
    x = x - x.mean(axis=0)
    emp = x.T @ x / t
    mu = np.trace(emp) / n
    delta_m = emp.copy()
    delta_m.flat[:: n + 1] -= mu
    delta = (delta_m**2).sum() / n
    x2 = x**2
    beta_ = ((x2.T @ x2) / t - emp**2).sum() / (n * t)
    beta = min(beta_, delta)
    shrink = 0.0 if delta == 0 else beta / delta
    shrunk = (1 - shrink) * emp + shrink * mu * np.eye(n)
    # Rescale from the 1/T estimator to the 1/(T-1) convention used elsewhere.
    shrunk *= t / max(t - 1, 1)
    return pd.DataFrame(shrunk * TRADING_DAYS, index=returns.columns, columns=returns.columns), float(shrink)


def ewma_covariance(returns: pd.DataFrame, lam: float = 0.94) -> pd.DataFrame:
    x = returns.to_numpy(dtype=float)
    x = x - x.mean(axis=0)
    t = len(x)
    w = lam ** np.arange(t - 1, -1, -1)
    w = w / w.sum()
    cov = (x * w[:, None]).T @ x
    return pd.DataFrame(cov * TRADING_DAYS, index=returns.columns, columns=returns.columns)


def estimate_covariance(returns: pd.DataFrame, method: str = "sample") -> pd.DataFrame:
    if method == "sample":
        return sample_covariance(returns)
    if method == "ledoit_wolf":
        return ledoit_wolf_covariance(returns)[0]
    if method == "ewma":
        return ewma_covariance(returns)
    raise ValueError(f"unknown covariance method {method!r}; expected one of {COV_METHODS}")


def bayes_stein_returns(returns: pd.DataFrame) -> tuple[pd.Series, float]:
    """Jorion's Bayes-Stein shrinkage of the mean vector. Returns (mu_annual, intensity)."""
    x = returns.to_numpy(dtype=float)
    t, n = x.shape
    mu = x.mean(axis=0)
    cov = np.cov(x, rowvar=False, ddof=1)
    inv = np.linalg.pinv(cov)
    ones = np.ones(n)
    w_gmv = inv @ ones / (ones @ inv @ ones)
    mu0 = float(w_gmv @ mu)
    d = mu - mu0
    denom = (n + 2) + t * float(d @ inv @ d)
    intensity = float(np.clip((n + 2) / denom, 0.0, 1.0)) if denom > 0 else 1.0
    shrunk = (1 - intensity) * mu + intensity * mu0
    return pd.Series(shrunk * TRADING_DAYS, index=returns.columns), intensity


def capm_returns(returns: pd.DataFrame, benchmark: pd.Series, risk_free_rate: float,
                 equity_risk_premium: float = 0.05) -> pd.Series:
    b = benchmark.reindex(returns.index)
    var_b = b.var(ddof=1)
    betas = returns.apply(lambda c: c.cov(b) / var_b if var_b > 0 else 1.0)
    return risk_free_rate + betas * equity_risk_premium


def estimate_expected_returns(returns: pd.DataFrame, method: str = "historical", *,
                              benchmark: pd.Series | None = None, risk_free_rate: float = 0.0) -> pd.Series:
    if method == "historical":
        return returns.mean() * TRADING_DAYS
    if method == "bayes_stein":
        return bayes_stein_returns(returns)[0]
    if method == "capm":
        if benchmark is None:
            raise ValueError("capm expected returns need a benchmark series")
        return capm_returns(returns, benchmark, risk_free_rate)
    raise ValueError(f"unknown expected-return method {method!r}; expected one of {RETURN_METHODS}")


def correlation_from_covariance(cov: pd.DataFrame) -> pd.DataFrame:
    sd = np.sqrt(np.clip(np.diag(cov.to_numpy()), 0, None))
    with np.errstate(divide="ignore", invalid="ignore"):
        corr = cov.to_numpy() / np.outer(sd, sd)
    corr[~np.isfinite(corr)] = 0.0
    np.fill_diagonal(corr, 1.0)
    return pd.DataFrame(corr, index=cov.index, columns=cov.columns)
