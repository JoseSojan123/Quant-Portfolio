"""Factor exposure (blueprint Stage 10, KB section 14).

Single-factor market model per asset:  R_i = alpha_i + beta_i R_m + e_i
Portfolio beta is the weighted sum of asset betas (equivalently, the beta of the
portfolio's own return series). Alpha is a regression intercept, not proof of skill.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant.risk.metrics import beta_alpha


def asset_betas(returns: pd.DataFrame, benchmark: pd.Series) -> pd.DataFrame:
    rows = {c: beta_alpha(returns[c], benchmark) for c in returns.columns}
    return pd.DataFrame(rows).T


def portfolio_factor_exposure(weights: dict[str, float], betas: pd.DataFrame) -> dict:
    w = pd.Series(weights, dtype=float)
    b = betas["beta"].reindex(w.index).fillna(0.0)
    contrib = w * b
    return {"beta": float(contrib.sum()), "contributions": {k: float(v) for k, v in contrib.items()}}


def sector_exposure(weights: dict[str, float], meta: dict[str, dict]) -> dict[str, float]:
    out: dict[str, float] = {}
    for t, w in weights.items():
        s = "Cash" if t == "CASH" else meta.get(t, {}).get("sector", "Other")
        out[s] = out.get(s, 0.0) + float(w)
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def sector_risk_contribution(rc_pct: dict[str, float], meta: dict[str, dict]) -> dict[str, float]:
    out: dict[str, float] = {}
    for t, v in rc_pct.items():
        s = "Cash" if t == "CASH" else meta.get(t, {}).get("sector", "Other")
        out[s] = out.get(s, 0.0) + float(v)
    return {k: (0.0 if not np.isfinite(v) else v) for k, v in sorted(out.items(), key=lambda kv: -kv[1])}
