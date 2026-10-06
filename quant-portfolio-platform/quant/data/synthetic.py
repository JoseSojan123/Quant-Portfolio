"""Deterministic synthetic market data for offline demos and tests.

Why this exists
---------------
The platform should run anywhere, including machines with no market-data access
(CI runners, sandboxes, a laptop on a plane). This generator produces a
realistic-looking daily price history for every asset in the universe so the full
product works out of the box. Run ``jobs/update_market_data.py --source yahoo`` on
a machine with internet access to replace it with real adjusted prices; the UI
labels the active data source either way.

How the data is generated
-------------------------
A small factor model drives every asset::

    r_i,t = alpha_i/252 + beta_i * M_t + s_i * S_sector(i),t
            - d_i * RATE_t + o_i * OIL_t + e_i,t

* ``M`` (market) follows a regime schedule that echoes real episodes (the
  early-2020 crash, the 2022 bear market, the April-2025 tariff shock) so the
  historical stress replays have something to replay.
* ``RATE`` is a "rates up" factor: positive values hurt rate-sensitive assets.
* Innovations are Student-t (df=5) scaled to unit variance, so tails are fatter
  than normal, as in real returns.
* Each price path is scaled so its final close matches a plausible level.

None of this is real data and it must never be presented as such.
"""

from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

from quant import TRADING_DAYS
from quant.data.calendar import last_completed_trading_day, trading_days
from quant.data.universe import ASSET_UNIVERSE

SYNTHETIC_SOURCE = "synthetic"
DEFAULT_START = dt.date(2019, 1, 2)
DEFAULT_SEED = 20240521

# (start, end, total return over the segment or None for annual drift, annual drift, annual vol)
_MARKET_REGIMES = [
    ("2019-01-01", "2019-12-31", None, 0.24, 0.13),
    ("2020-01-01", "2020-02-19", None, 0.10, 0.11),
    ("2020-02-20", "2020-03-23", -0.34, None, 0.75),
    ("2020-03-24", "2020-08-31", 0.50, None, 0.32),
    ("2020-09-01", "2021-12-31", None, 0.22, 0.15),
    ("2022-01-03", "2022-10-12", -0.25, None, 0.24),
    ("2022-10-13", "2023-12-31", None, 0.20, 0.16),
    ("2024-01-01", "2025-02-19", None, 0.19, 0.13),
    ("2025-02-20", "2025-04-08", -0.19, None, 0.38),
    ("2025-04-09", "2025-12-31", None, 0.30, 0.15),
    ("2026-01-01", "2030-12-31", None, 0.10, 0.15),
]

# Single days pinned to a specific market return (big real-world moves).
_PINNED_MARKET_DAYS = {
    "2020-03-12": -0.095, "2020-03-16": -0.12, "2020-03-24": 0.09,
    "2025-04-03": -0.048, "2025-04-04": -0.060, "2025-04-09": 0.105,
}

# Extra drifts (annualized, added on top of noise) for non-market factors by period.
_FACTOR_EPISODES = {
    "Technology": [("2020-03-24", "2021-12-31", 0.10), ("2022-01-03", "2022-12-30", -0.20),
                   ("2023-01-02", "2024-12-31", 0.18)],
    "Energy": [("2020-01-01", "2020-10-30", -0.45), ("2020-11-02", "2022-06-08", 0.45),
               ("2022-06-09", "2023-03-31", -0.10)],
    "RATE": [("2020-02-20", "2020-08-04", -0.30), ("2021-01-04", "2021-03-31", 0.40),
             ("2022-01-03", "2022-10-24", 0.42), ("2023-07-03", "2023-10-19", 0.45),
             ("2023-10-20", "2023-12-29", -0.55), ("2024-01-02", "2026-12-31", 0.0)],
    "OIL": [("2020-01-01", "2020-04-30", -1.2), ("2020-05-01", "2022-06-08", 0.35),
            ("2022-01-03", "2022-06-08", 1.4),
            ("2022-06-09", "2022-12-30", -0.35)],
}
_FACTOR_VOL = {"sector": 0.10, "RATE": 0.13, "OIL": 0.30}


def _t_noise(rng: np.random.Generator, size, df: float = 5.0) -> np.ndarray:
    """Student-t innovations rescaled to unit variance."""
    return rng.standard_t(df, size=size) / np.sqrt(df / (df - 2.0))


def _market_returns(dates: pd.DatetimeIndex, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    n = len(dates)
    r = np.zeros(n)
    vol = np.full(n, 0.15)
    for start, end, total, drift, ann_vol in _MARKET_REGIMES:
        mask = (dates >= pd.Timestamp(start)) & (dates <= pd.Timestamp(end))
        idx = np.flatnonzero(mask)
        if idx.size == 0:
            continue
        sd = ann_vol / np.sqrt(TRADING_DAYS)
        vol[idx] = ann_vol
        seg = _t_noise(rng, idx.size) * sd
        pinned = np.array([d.strftime("%Y-%m-%d") in _PINNED_MARKET_DAYS for d in dates[idx]])
        for j, d in enumerate(dates[idx]):
            key = d.strftime("%Y-%m-%d")
            if key in _PINNED_MARKET_DAYS:
                seg[j] = _PINNED_MARKET_DAYS[key]
        free = ~pinned
        if total is not None and free.any():
            # Calibrate the free days so the segment's compounded return equals `total`.
            target_log = np.log1p(total) - np.log1p(seg[pinned]).sum()
            logs = np.log1p(np.clip(seg[free], -0.5, None))
            logs = logs - logs.mean() + target_log / free.sum()
            seg[free] = np.expm1(logs)
        elif drift is not None:
            seg[free] = seg[free] - seg[free].mean() + drift / TRADING_DAYS
        r[idx] = seg
    return r, vol


def _episode_drift(dates: pd.DatetimeIndex, episodes) -> np.ndarray:
    out = np.zeros(len(dates))
    for start, end, ann in episodes:
        mask = (dates >= pd.Timestamp(start)) & (dates <= pd.Timestamp(end))
        out[mask] += ann / TRADING_DAYS
    return out


def generate_synthetic_returns(
    start: dt.date | str = DEFAULT_START,
    end: dt.date | str | None = None,
    seed: int = DEFAULT_SEED,
) -> pd.DataFrame:
    """Daily simple returns (dates x tickers) for the full universe."""
    end = end or last_completed_trading_day()
    dates = trading_days(start, end)
    n = len(dates)
    rng = np.random.default_rng(seed)

    market, mkt_vol = _market_returns(dates, rng)
    vol_scale = 0.6 + 0.4 * (mkt_vol / 0.15)  # idiosyncratic vol rises in turbulent regimes

    sectors = sorted({a["synthetic"].get("sector_factor", a["sector"]) for a in ASSET_UNIVERSE})
    sector_f = {}
    for s in sectors:
        noise = _t_noise(rng, n) * _FACTOR_VOL["sector"] / np.sqrt(TRADING_DAYS) * vol_scale
        sector_f[s] = noise + _episode_drift(dates, _FACTOR_EPISODES.get(s, []))
    rate_f = _t_noise(rng, n) * _FACTOR_VOL["RATE"] / np.sqrt(TRADING_DAYS) + _episode_drift(dates, _FACTOR_EPISODES["RATE"])
    oil_f = (_t_noise(rng, n) * _FACTOR_VOL["OIL"] / np.sqrt(TRADING_DAYS) * vol_scale
             + _episode_drift(dates, _FACTOR_EPISODES["OIL"]))

    cols = {}
    for a in ASSET_UNIVERSE:
        p = a["synthetic"]
        sec = p.get("sector_factor", a["sector"])
        idio = _t_noise(rng, n) * p["idio"] / np.sqrt(TRADING_DAYS) * vol_scale
        r = (p["alpha"] / TRADING_DAYS + p["beta"] * market + p["sector"] * sector_f[sec]
             - p["rate"] * rate_f + p["oil"] * oil_f + idio)
        cols[a["ticker"]] = np.clip(r, -0.6, 1.0)
    return pd.DataFrame(cols, index=dates)


def generate_synthetic_prices(
    start: dt.date | str = DEFAULT_START,
    end: dt.date | str | None = None,
    seed: int = DEFAULT_SEED,
) -> pd.DataFrame:
    """Long-format OHLCV table: date, ticker, open, high, low, close, adjusted_close, volume, source."""
    rets = generate_synthetic_returns(start, end, seed)
    rng = np.random.default_rng(seed + 1)
    frames = []
    for a in ASSET_UNIVERSE:
        t = a["ticker"]
        r = rets[t].to_numpy()
        growth = np.cumprod(1.0 + r)
        close = a["synthetic"]["end"] * growth / growth[-1]
        # First day has no prior close: treat its return as the open-to-close move.
        prev_close = np.concatenate([[close[0] / (1 + r[0])], close[:-1]])
        day_sd = max(np.std(r), 1e-4)
        gap = rng.normal(0, 0.25 * day_sd, len(r))
        open_ = prev_close * (1 + gap)
        wick = np.abs(rng.normal(0, 0.45 * day_sd, (2, len(r))))
        high = np.maximum(open_, close) * (1 + wick[0])
        low = np.minimum(open_, close) * (1 - wick[1])
        base_vol = 2e9 / a["synthetic"]["end"] if a["asset_type"] == "Stock" else 8e8 / a["synthetic"]["end"]
        volume = base_vol * np.exp(rng.normal(0, 0.25, len(r))) * (1 + 8 * np.abs(r))
        frames.append(pd.DataFrame({
            "date": rets.index.date, "ticker": t,
            "open": open_.round(4), "high": high.round(4), "low": low.round(4),
            "close": close.round(4), "adjusted_close": close.round(4),
            "volume": volume.astype(np.int64), "source": SYNTHETIC_SOURCE,
        }))
    return pd.concat(frames, ignore_index=True)
