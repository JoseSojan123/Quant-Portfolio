"""Monte Carlo simulation of portfolio outcomes (blueprint Stage 8, KB section 12).

Workflow: estimate mu and Sigma -> generate correlated daily asset returns ->
apply the portfolio's holdings -> repeat for many paths -> summarize terminal
values, losses and percentiles.

Return models
  normal     multivariate normal, r_t = mu_d + L z_t with L the Cholesky factor of Sigma_d
  student_t  multivariate Student-t (df=5) scaled to the same covariance: fatter tails
  bootstrap  resample whole historical days (keeps cross-asset dependence and the
             empirical tails without assuming a distribution)

Holdings are buy-and-hold: each asset's value compounds on its own, so weights
drift during the horizon exactly as they would in an untouched account.

Monte Carlo is a scenario generator built on assumptions. It is not a forecast.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant import TRADING_DAYS

METHODS = ("normal", "student_t", "bootstrap")
MAX_DRAWS = 120_000_000  # n_sims x horizon x n_assets safety limit


def _cholesky(cov: np.ndarray) -> np.ndarray:
    cov = 0.5 * (cov + cov.T)
    try:
        return np.linalg.cholesky(cov)
    except np.linalg.LinAlgError:
        vals, vecs = np.linalg.eigh(cov)
        vals = np.clip(vals, 1e-14, None)
        return np.linalg.cholesky(vecs @ np.diag(vals) @ vecs.T)


def simulate_paths(
    weights: pd.Series,
    mu_annual: pd.Series,
    cov_annual: pd.DataFrame,
    *,
    initial_value: float = 100_000.0,
    horizon_days: int = 252,
    n_sims: int = 5000,
    method: str = "normal",
    historical_returns: pd.DataFrame | None = None,
    seed: int | None = 42,
    chunk: int = 1000,
) -> np.ndarray:
    """Simulated portfolio value paths, shape ``(n_sims, horizon_days + 1)``."""
    if method not in METHODS:
        raise ValueError(f"unknown method {method!r}; expected one of {METHODS}")
    tickers = [t for t in weights.index if abs(weights[t]) > 0]
    w = weights[tickers].to_numpy(dtype=float)
    n = len(tickers)
    if n * horizon_days * n_sims > MAX_DRAWS:
        raise ValueError("simulation too large: reduce simulations, horizon or number of assets")
    rng = np.random.default_rng(seed)
    out = np.empty((n_sims, horizon_days + 1), dtype=np.float64)
    out[:, 0] = initial_value

    cash_mask = np.array([t == "CASH" for t in tickers])
    risky = [t for t in tickers if t != "CASH"]
    mu_d = np.array([mu_annual[t] / TRADING_DAYS for t in tickers])
    if method != "bootstrap":
        cov_d = np.zeros((n, n))
        if risky:
            idx = [tickers.index(t) for t in risky]
            cov_d[np.ix_(idx, idx)] = cov_annual.loc[risky, risky].to_numpy() / TRADING_DAYS
        chol = _cholesky(cov_d + np.eye(n) * 1e-16)
    else:
        if historical_returns is None:
            raise ValueError("bootstrap needs historical_returns")
        hist = np.zeros((len(historical_returns), n))
        for j, t in enumerate(tickers):
            if t == "CASH":
                hist[:, j] = mu_d[j]
            else:
                hist[:, j] = historical_returns[t].to_numpy()

    chunk = max(1, min(chunk, 4_000_000 // max(1, horizon_days * n)))
    for start in range(0, n_sims, chunk):
        m = min(chunk, n_sims - start)
        if method == "normal":
            z = rng.standard_normal((m, horizon_days, n))
            r = mu_d + z @ chol.T
        elif method == "student_t":
            df = 5.0
            z = rng.standard_normal((m, horizon_days, n))
            g = rng.chisquare(df, (m, horizon_days, 1)) / df
            r = mu_d + (z @ chol.T) / np.sqrt(g) * np.sqrt((df - 2) / df)
        else:
            idx = rng.integers(0, len(hist), (m, horizon_days))
            r = hist[idx]
        r[..., cash_mask] = mu_d[cash_mask]
        r = np.clip(r, -0.99, None)
        growth = np.cumprod(1.0 + r, axis=1)                 # (m, H, n)
        values = initial_value * (growth @ w)                # buy-and-hold: each sleeve compounds
        out[start:start + m, 1:] = values
    return out


def summarize_paths(paths: np.ndarray, *, initial_value: float, target_value: float | None = None,
                    n_points: int = 120, n_sample_paths: int = 25, bins: int = 50,
                    loss_threshold: float = 0.10) -> dict:
    horizon = paths.shape[1] - 1
    terminal = paths[:, -1]
    ret = terminal / initial_value - 1.0
    pnl = terminal - initial_value
    peak = np.maximum.accumulate(paths, axis=1)
    mdd = (paths / peak - 1.0).min(axis=1)

    step = max(1, horizon // n_points)
    t_idx = np.unique(np.concatenate([np.arange(0, horizon + 1, step), [horizon]]))
    qs = [1, 5, 25, 50, 75, 95, 99]
    pct = np.percentile(paths[:, t_idx], qs, axis=0)
    bands = [{"day": int(d), **{f"p{q}": float(pct[i, j]) for i, q in enumerate(qs)}} for j, d in enumerate(t_idx)]

    rng = np.random.default_rng(0)
    pick = rng.choice(paths.shape[0], size=min(n_sample_paths, paths.shape[0]), replace=False)
    samples = [[float(v) for v in paths[i, t_idx]] for i in pick]

    counts, edges = np.histogram(terminal, bins=bins)
    hist = [{"lo": float(edges[i]), "hi": float(edges[i + 1]), "count": int(counts[i])} for i in range(len(counts))]

    def var_es(c):
        q = np.quantile(pnl, 1 - c)
        return float(-q), float(-pnl[pnl <= q].mean())

    v95, e95 = var_es(0.95)
    v99, e99 = var_es(0.99)
    out = {
        "n_sims": int(paths.shape[0]), "horizon_days": int(horizon), "initial_value": float(initial_value),
        "terminal": {
            "mean": float(terminal.mean()), "median": float(np.median(terminal)),
            "p1": float(np.percentile(terminal, 1)), "p5": float(np.percentile(terminal, 5)),
            "p95": float(np.percentile(terminal, 95)), "p99": float(np.percentile(terminal, 99)),
            "best": float(terminal.max()), "worst": float(terminal.min()),
        },
        "expected_return": float(ret.mean()), "median_return": float(np.median(ret)),
        "prob_loss": float((ret < 0).mean()),
        "prob_loss_threshold": float((ret < -loss_threshold).mean()), "loss_threshold": loss_threshold,
        "var_95": v95, "es_95": e95, "var_99": v99, "es_99": e99,
        "max_drawdown": {"median": float(np.median(mdd)), "p5": float(np.percentile(mdd, 5)),
                         "mean": float(mdd.mean())},
        "bands": bands, "sample_paths": samples, "sample_days": [int(d) for d in t_idx], "histogram": hist,
    }
    if target_value is not None:
        out["target_value"] = float(target_value)
        out["prob_target"] = float((terminal >= target_value).mean())
    return out


def run_monte_carlo(weights: pd.Series, mu_annual: pd.Series, cov_annual: pd.DataFrame, *,
                    initial_value: float = 100_000.0, horizon_days: int = 252, n_sims: int = 5000,
                    method: str = "normal", historical_returns: pd.DataFrame | None = None,
                    target_value: float | None = None, seed: int | None = 42, loss_threshold: float = 0.10) -> dict:
    paths = simulate_paths(weights, mu_annual, cov_annual, initial_value=initial_value, horizon_days=horizon_days,
                           n_sims=n_sims, method=method, historical_returns=historical_returns, seed=seed)
    res = summarize_paths(paths, initial_value=initial_value, target_value=target_value, loss_threshold=loss_threshold)
    res["method"] = method
    return res
