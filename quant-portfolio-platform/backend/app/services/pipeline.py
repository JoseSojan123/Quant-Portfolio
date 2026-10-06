"""Market-data pipeline: download -> validate -> upsert prices -> recompute returns -> log.

Used by the startup seed (synthetic data when the database is empty) and by the
scheduled jobs in ``jobs/``.
"""

from __future__ import annotations

import datetime as dt
import logging

import numpy as np
import pandas as pd
from sqlalchemy import delete, func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.db.models import Asset, DataUpdate, PriceDaily, ReturnDaily
from quant.data.providers import fetch_prices
from quant.data.synthetic import DEFAULT_START
from quant.data.universe import ASSET_UNIVERSE, BENCHMARK
from quant.data.validation import validate_prices

log = logging.getLogger("qpp.pipeline")
CHUNK = 5000


def _insert(session: Session):
    name = session.get_bind().dialect.name
    if name == "postgresql":
        return postgresql.insert
    if name == "sqlite":
        return sqlite.insert
    raise RuntimeError(f"unsupported database dialect {name}")


def sync_assets(session: Session) -> dict[str, int]:
    """Upsert the asset master from the universe definition; returns {ticker: asset_id}."""
    existing = {a.ticker: a for a in session.scalars(select(Asset))}
    for a in ASSET_UNIVERSE:
        row = existing.get(a["ticker"])
        if row is None:
            row = Asset(ticker=a["ticker"])
            session.add(row)
        row.name, row.sector, row.asset_type = a["name"], a["sector"], a["asset_type"]
        row.currency = a.get("currency", "USD")
        row.tags = list(a.get("tags", []))
        row.is_benchmark = a["ticker"] == BENCHMARK
    session.flush()
    return {a.ticker: a.asset_id for a in session.scalars(select(Asset))}


def upsert_prices(session: Session, clean: pd.DataFrame, ids: dict[str, int]) -> int:
    now = dt.datetime.now(dt.timezone.utc)
    ins = _insert(session)
    rows = []
    for r in clean.itertuples(index=False):
        if r.ticker not in ids:
            continue
        rows.append({
            "asset_id": ids[r.ticker], "date": pd.Timestamp(r.date).date(),
            "open": _f(getattr(r, "open", None)), "high": _f(getattr(r, "high", None)),
            "low": _f(getattr(r, "low", None)),
            "close": _f(getattr(r, "close", None)) or float(r.adjusted_close),
            "adjusted_close": float(r.adjusted_close),
            "volume": int(r.volume) if getattr(r, "volume", None) is not None and not pd.isna(r.volume) else None,
            "source": getattr(r, "source", "unknown"), "downloaded_at": now,
        })
    for i in range(0, len(rows), CHUNK):
        stmt = ins(PriceDaily).values(rows[i:i + CHUNK])
        stmt = stmt.on_conflict_do_update(
            index_elements=["asset_id", "date"],
            set_={c: getattr(stmt.excluded, c) for c in
                  ["open", "high", "low", "close", "adjusted_close", "volume", "source", "downloaded_at"]},
        )
        session.execute(stmt)
    return len(rows)


def recalculate_returns(session: Session, asset_ids: list[int] | None = None) -> int:
    """Recompute returns_daily from prices_daily (simple and log returns per asset)."""
    q = select(PriceDaily.asset_id, PriceDaily.date, PriceDaily.adjusted_close)
    if asset_ids:
        q = q.where(PriceDaily.asset_id.in_(asset_ids))
    df = pd.DataFrame(session.execute(q).all(), columns=["asset_id", "date", "px"])
    if df.empty:
        return 0
    df = df.sort_values(["asset_id", "date"])
    df["simple_return"] = df.groupby("asset_id")["px"].pct_change(fill_method=None)
    df["log_return"] = np.log1p(df["simple_return"])
    df = df.dropna(subset=["simple_return"])
    ids = df["asset_id"].unique().tolist()
    session.execute(delete(ReturnDaily).where(ReturnDaily.asset_id.in_(ids)))
    rows = [{"asset_id": int(a), "date": d, "simple_return": float(s), "log_return": float(lr)}
            for a, d, s, lr in df[["asset_id", "date", "simple_return", "log_return"]].itertuples(index=False)]
    for i in range(0, len(rows), CHUNK):
        session.execute(ReturnDaily.__table__.insert(), rows[i:i + CHUNK])
    return len(rows)


def run_update(session: Session, source: str = "synthetic", tickers: list[str] | None = None,
               start: dt.date | str | None = None, end: dt.date | str | None = None) -> DataUpdate:
    """Full pipeline run, recorded in ``data_updates``."""
    tickers = tickers or [a["ticker"] for a in ASSET_UNIVERSE]
    upd = DataUpdate(source=source, status="running")
    session.add(upd)
    session.commit()
    try:
        ids = sync_assets(session)
        if start is None:
            start = DEFAULT_START
            if source != "synthetic":
                has_synthetic = session.scalar(select(func.count()).select_from(PriceDaily)
                                               .where(PriceDaily.source == "synthetic")) or 0
                last = session.scalar(select(func.max(PriceDaily.date)).where(PriceDaily.source == source))
                if last and not has_synthetic:
                    # Incremental refresh: re-download a short overlap window to pick up corrections.
                    start = last - dt.timedelta(days=10)
        raw = fetch_prices(source, tickers, start, end)
        clean, report = validate_prices(raw)
        n = upsert_prices(session, clean, ids)
        if source == "synthetic":
            # Synthetic history is regenerated as a whole; drop rows from any other source.
            session.execute(delete(PriceDaily).where(PriceDaily.source != "synthetic"))
        else:
            session.execute(delete(PriceDaily).where(PriceDaily.source == "synthetic"))
        recalculate_returns(session)
        upd.status = "success"
        upd.rows_upserted = n
        upd.first_date = session.scalar(select(func.min(PriceDaily.date)))
        upd.last_date = session.scalar(select(func.max(PriceDaily.date)))
        upd.report = report.as_dict()
        upd.message = f"{n} price rows from {source}; {len(report.tickers)} tickers"
    except Exception as exc:
        session.rollback()
        upd = session.merge(upd)
        upd.status = "failed"
        upd.message = str(exc)[:2000]
        log.exception("market data update failed")
    upd.finished_at = dt.datetime.now(dt.timezone.utc)
    session.commit()
    return upd


def ensure_seeded(session: Session, source: str = "synthetic") -> None:
    sync_assets(session)
    session.commit()
    has_prices = session.scalar(select(func.count()).select_from(PriceDaily)) or 0
    if has_prices == 0:
        log.info("No market data found; seeding from %s source", source)
        upd = run_update(session, source)
        if upd.status != "success" and source != "synthetic":
            log.warning("Seeding from %s failed (%s); falling back to synthetic data", source, upd.message)
            run_update(session, "synthetic")


def _f(x) -> float | None:
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else v
