"""Public market-data endpoints: asset list, price history and data freshness."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_snapshot
from app.core.config import get_settings
from app.db.models import DataUpdate
from app.db.session import get_db
from app.services.analytics import sanitize
from app.services.market_data import MarketSnapshot
from quant import TRADING_DAYS

router = APIRouter(tags=["market data"])


@router.get("/assets")
def list_assets(snap: MarketSnapshot = Depends(get_snapshot)):
    out = []
    window = snap.adjusted.iloc[-(TRADING_DAYS + 1):]
    rets = window.pct_change(fill_method=None).iloc[1:]
    for t in snap.tickers:
        m = snap.meta.get(t, {})
        s = window[t].dropna()
        out.append({
            "ticker": t, "name": m.get("name", t), "sector": m.get("sector"), "asset_type": m.get("asset_type"),
            "currency": m.get("currency", "USD"), "tags": m.get("tags", []), "is_benchmark": m.get("is_benchmark", False),
            "last_price": snap.latest_price(t),
            "day_change_pct": (snap.latest_price(t) / snap.previous_price(t) - 1) if snap.previous_price(t) else None,
            "return_1y": float(s.iloc[-1] / s.iloc[0] - 1) if len(s) > 1 else None,
            "volatility_1y": float(rets[t].std() * np.sqrt(TRADING_DAYS)) if t in rets else None,
        })
    return sanitize(out)


@router.get("/assets/{ticker}/history")
def asset_history(ticker: str, days: int = Query(default=756, ge=5, le=5000),
                  snap: MarketSnapshot = Depends(get_snapshot)):
    t = ticker.upper()
    if t not in snap.adjusted.columns:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown ticker {ticker}")
    s = snap.adjusted[t].dropna().iloc[-days:]
    c = snap.close[t].dropna().iloc[-days:]
    return {"ticker": t, "points": [{"date": d.date().isoformat(), "adjusted_close": float(a), "close": float(c.get(d, a))}
                                    for d, a in s.items()]}


@router.get("/meta/data-status")
def data_status(db: Session = Depends(get_db), snap: MarketSnapshot = Depends(get_snapshot)):
    last = db.scalars(select(DataUpdate).order_by(DataUpdate.id.desc()).limit(1)).first()
    ok = db.scalars(select(DataUpdate).where(DataUpdate.status == "success").order_by(DataUpdate.id.desc())
                    .limit(1)).first()
    return {
        "source": snap.source, "synthetic": snap.source == "synthetic",
        "last_updated": ok.finished_at.isoformat() if ok and ok.finished_at else None,
        "first_date": snap.first_date.isoformat() if snap.first_date else None,
        "last_date": snap.last_date.isoformat() if snap.last_date else None,
        "assets": len(snap.tickers),
        "last_run": {"status": last.status, "message": last.message,
                     "started_at": last.started_at.isoformat() if last.started_at else None} if last else None,
    }


@router.get("/meta/app")
def app_meta():
    s = get_settings()
    return {"name": s.app_name, "version": s.app_version, "environment": s.app_env,
            "repository": s.github_url or None, "data_source": s.data_source,
            "email_verification": s.require_email_verification}
