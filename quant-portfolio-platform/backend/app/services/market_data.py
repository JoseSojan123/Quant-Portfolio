"""In-memory snapshot of market data, reloaded whenever the pipeline records a new update."""

from __future__ import annotations

import datetime as dt
import threading
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Asset, DataUpdate, PriceDaily
from quant.data.universe import BENCHMARK
from quant.features.returns import simple_returns


class UnknownTickerError(ValueError):
    pass


@dataclass
class MarketSnapshot:
    adjusted: pd.DataFrame  # dates x tickers (for returns)
    close: pd.DataFrame     # dates x tickers (for valuation)
    meta: dict[str, dict]
    source: str
    last_updated: dt.datetime | None
    version: tuple

    @property
    def tickers(self) -> list[str]:
        return list(self.adjusted.columns)

    @property
    def first_date(self) -> dt.date | None:
        return self.adjusted.index[0].date() if len(self.adjusted) else None

    @property
    def last_date(self) -> dt.date | None:
        return self.adjusted.index[-1].date() if len(self.adjusted) else None

    def require(self, tickers: list[str]) -> list[str]:
        clean = []
        for t in tickers:
            u = t.strip().upper()
            if u not in self.adjusted.columns:
                raise UnknownTickerError(f"Unknown or unsupported ticker: {t}")
            if u not in clean:
                clean.append(u)
        return clean

    def latest_price(self, ticker: str) -> float:
        s = self.close[ticker].dropna()
        return float(s.iloc[-1])

    def previous_price(self, ticker: str) -> float | None:
        s = self.close[ticker].dropna()
        return float(s.iloc[-2]) if len(s) > 1 else None

    def returns(self, tickers: list[str], lookback_days: int | None = None, include_benchmark: bool = True
                ) -> tuple[pd.DataFrame, pd.Series | None]:
        """Aligned simple returns for ``tickers`` over the trailing window, plus benchmark returns."""
        cols = list(dict.fromkeys(tickers + ([BENCHMARK] if include_benchmark and BENCHMARK in self.adjusted else [])))
        px = self.adjusted[cols].dropna(how="any")
        if lookback_days:
            px = px.iloc[-(lookback_days + 1):]
        r = simple_returns(px)
        bench = r[BENCHMARK] if include_benchmark and BENCHMARK in r else None
        return r[tickers], bench


class MarketDataStore:
    def __init__(self) -> None:
        self._snap: MarketSnapshot | None = None
        self._lock = threading.Lock()

    def _version(self, db: Session) -> tuple:
        last = db.execute(select(DataUpdate.id, DataUpdate.finished_at).where(DataUpdate.status == "success")
                          .order_by(DataUpdate.id.desc()).limit(1)).first()
        count = db.scalar(select(func.count()).select_from(PriceDaily))
        return (last[0] if last else None, count)

    def get(self, db: Session) -> MarketSnapshot:
        version = self._version(db)
        with self._lock:
            if self._snap is not None and self._snap.version == version:
                return self._snap
            self._snap = self._load(db, version)
            return self._snap

    def invalidate(self) -> None:
        with self._lock:
            self._snap = None

    def _load(self, db: Session, version: tuple) -> MarketSnapshot:
        assets = {a.asset_id: a for a in db.scalars(select(Asset))}
        rows = db.execute(select(PriceDaily.asset_id, PriceDaily.date, PriceDaily.adjusted_close,
                                 PriceDaily.close, PriceDaily.source)).all()
        df = pd.DataFrame(rows, columns=["asset_id", "date", "adj", "close", "source"])
        if df.empty:
            empty = pd.DataFrame()
            return MarketSnapshot(empty, empty, {}, "none", None, version)
        df["ticker"] = df["asset_id"].map({k: v.ticker for k, v in assets.items()})
        df["date"] = pd.to_datetime(df["date"])
        adj = df.pivot(index="date", columns="ticker", values="adj").sort_index()
        close = df.pivot(index="date", columns="ticker", values="close").sort_index()
        adj.columns.name = close.columns.name = None
        meta = {a.ticker: {"name": a.name, "sector": a.sector, "asset_type": a.asset_type, "currency": a.currency,
                           "tags": list(a.tags or []), "is_benchmark": a.is_benchmark}
                for a in assets.values() if a.ticker in adj.columns}
        sources = df["source"].value_counts()
        source = str(sources.index[0]) if len(sources) else "unknown"
        upd = db.scalars(select(DataUpdate).where(DataUpdate.status == "success").order_by(DataUpdate.id.desc())
                         .limit(1)).first()
        return MarketSnapshot(adj.astype(float), close.astype(float), meta, source,
                              upd.finished_at if upd else None, version)


store = MarketDataStore()


def finite(x):
    try:
        return None if x is None or not np.isfinite(x) else float(x)
    except TypeError:
        return None
