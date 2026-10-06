"""Market-data providers.

``yahoo`` uses the ``yfinance`` package (prototyping-grade data, needs internet).
``synthetic`` is the offline generator in ``quant.data.synthetic``.

Both return the same long-format table, so the rest of the pipeline does not care
where prices came from. Always document what the provider's "adjusted" field
means: for Yahoo, ``Adj Close`` is adjusted for splits and dividends.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd

from quant.data.synthetic import generate_synthetic_prices

PROVIDERS = ("synthetic", "yahoo")


def download_yahoo(tickers: list[str], start: dt.date | str, end: dt.date | str | None = None) -> pd.DataFrame:
    try:
        import yfinance as yf
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("yfinance is not installed: pip install yfinance") from exc

    raw = yf.download(
        tickers=tickers, start=str(start), end=None if end is None else str(pd.Timestamp(end) + pd.Timedelta(days=1)),
        auto_adjust=False, actions=False, group_by="ticker", progress=False, threads=True,
    )
    if raw is None or raw.empty:
        raise RuntimeError("Yahoo Finance returned no data (network blocked or tickers invalid)")

    frames = []
    for t in tickers:
        try:
            sub = raw[t] if isinstance(raw.columns, pd.MultiIndex) else raw
        except KeyError:
            continue
        sub = sub.rename(columns={"Open": "open", "High": "high", "Low": "low", "Close": "close",
                                  "Adj Close": "adjusted_close", "Volume": "volume"})
        sub = sub.reset_index().rename(columns={"Date": "date"})
        sub["ticker"] = t
        frames.append(sub[["date", "ticker", "open", "high", "low", "close", "adjusted_close", "volume"]])
    if not frames:
        raise RuntimeError("Yahoo Finance returned no usable series")
    out = pd.concat(frames, ignore_index=True)
    out["source"] = "yahoo"
    return out


def fetch_prices(source: str, tickers: list[str], start: dt.date | str, end: dt.date | str | None = None) -> pd.DataFrame:
    if source == "yahoo":
        return download_yahoo(tickers, start, end)
    if source == "synthetic":
        df = generate_synthetic_prices(start=start, end=end)
        return df[df["ticker"].isin(tickers)].reset_index(drop=True)
    raise ValueError(f"unknown data source {source!r}; expected one of {PROVIDERS}")
