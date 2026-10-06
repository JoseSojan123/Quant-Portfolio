"""User-owned portfolios and manually entered holdings (V2 addendum sections 5-7)."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_snapshot
from app.db.models import Holding, Portfolio, User
from app.db.session import get_db
from app.schemas.portfolio import HoldingIn, HoldingUpdate, PortfolioCreate, PortfolioSummary, PortfolioUpdate
from app.services import analytics as A
from app.services.market_data import MarketSnapshot

router = APIRouter(prefix="/portfolios", tags=["portfolios"])
MAX_PORTFOLIOS = 25
MAX_HOLDINGS = 100


def _check_ticker(snap: MarketSnapshot, ticker: str) -> str:
    t = ticker.strip().upper()
    if t not in snap.close.columns:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{t} is not in the supported asset universe. See the asset list for available tickers.")
    return t


def _detail(p: Portfolio, snap: MarketSnapshot, user: User) -> dict:
    return A.sanitize({"id": p.id, "name": p.name, "description": p.description, "base_currency": p.base_currency,
                       "created_at": p.created_at.isoformat(), "updated_at": p.updated_at.isoformat(),
                       "is_default": user.default_portfolio_id == p.id, "valuation": A.valuation(snap, p)})


@router.get("", response_model=list[PortfolioSummary])
def list_portfolios(user: User = Depends(get_current_user), db: Session = Depends(get_db),
                    snap: MarketSnapshot = Depends(get_snapshot)):
    out = []
    for p in db.scalars(select(Portfolio).where(Portfolio.owner_id == user.id).order_by(Portfolio.created_at)):
        v = A.valuation(snap, p) if p.holdings else None
        out.append(PortfolioSummary(id=p.id, name=p.name, description=p.description, base_currency=p.base_currency,
                                    created_at=p.created_at, updated_at=p.updated_at, holdings_count=len(p.holdings),
                                    current_value=v["current_value"] if v else None,
                                    invested_value=v["invested_value"] if v else None,
                                    unrealized_pnl=v["unrealized_pnl"] if v else None,
                                    is_default=user.default_portfolio_id == p.id))
    return out


@router.post("", status_code=201)
def create_portfolio(body: PortfolioCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                     snap: MarketSnapshot = Depends(get_snapshot)):
    count = len(user.portfolios)
    if count >= MAX_PORTFOLIOS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can keep up to {MAX_PORTFOLIOS} portfolios.")
    seen = set()
    for h in body.holdings:
        t = _check_ticker(snap, h.ticker)
        if t in seen:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{t} appears twice. Combine it into one holding.")
        seen.add(t)
    p = Portfolio(owner_id=user.id, name=body.name.strip(), description=body.description,
                  base_currency=body.base_currency)
    db.add(p)
    db.flush()
    for h in body.holdings:
        db.add(Holding(portfolio_id=p.id, ticker=h.ticker, quantity=h.quantity, average_cost=h.average_cost,
                       asset_type=h.asset_type or snap.meta.get(h.ticker, {}).get("asset_type"),
                       currency=h.currency, notes=h.notes))
    if body.make_default or count == 0 or not user.default_portfolio_id:
        user.default_portfolio_id = p.id
    db.commit()
    db.refresh(p)
    return _detail(p, snap, user)


@router.get("/{portfolio_id}")
def get_portfolio(portfolio_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                  snap: MarketSnapshot = Depends(get_snapshot)):
    return _detail(A.get_owned_portfolio(db, user, portfolio_id), snap, user)


@router.patch("/{portfolio_id}")
def update_portfolio(portfolio_id: str, body: PortfolioUpdate, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db), snap: MarketSnapshot = Depends(get_snapshot)):
    p = A.get_owned_portfolio(db, user, portfolio_id)
    if body.name is not None:
        p.name = body.name.strip()
    if body.description is not None:
        p.description = body.description
    db.commit()
    return _detail(p, snap, user)


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(portfolio_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = A.get_owned_portfolio(db, user, portfolio_id)
    db.delete(p)
    if user.default_portfolio_id == portfolio_id:
        rest = [x for x in user.portfolios if x.id != portfolio_id]
        user.default_portfolio_id = rest[0].id if rest else None
    db.commit()
    return Response(status_code=204)


@router.post("/{portfolio_id}/default")
def make_default(portfolio_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    A.get_owned_portfolio(db, user, portfolio_id)
    user.default_portfolio_id = portfolio_id
    db.commit()
    return {"default_portfolio_id": portfolio_id}


@router.post("/{portfolio_id}/holdings", status_code=201)
def add_holding(portfolio_id: str, body: HoldingIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db), snap: MarketSnapshot = Depends(get_snapshot)):
    p = A.get_owned_portfolio(db, user, portfolio_id)
    t = _check_ticker(snap, body.ticker)
    if any(h.ticker == t for h in p.holdings):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{t} is already in this portfolio. Edit that holding instead.")
    if len(p.holdings) >= MAX_HOLDINGS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A portfolio can hold up to {MAX_HOLDINGS} positions.")
    db.add(Holding(portfolio_id=p.id, ticker=t, quantity=body.quantity, average_cost=body.average_cost,
                   asset_type=body.asset_type or snap.meta.get(t, {}).get("asset_type"), currency=body.currency,
                   notes=body.notes))
    db.commit()
    db.refresh(p)
    return _detail(p, snap, user)


@router.patch("/{portfolio_id}/holdings/{holding_id}")
def update_holding(portfolio_id: str, holding_id: str, body: HoldingUpdate, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db), snap: MarketSnapshot = Depends(get_snapshot)):
    p = A.get_owned_portfolio(db, user, portfolio_id)
    h = next((x for x in p.holdings if x.id == holding_id), None)
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holding not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(h, k, v)
    db.commit()
    db.refresh(p)
    return _detail(p, snap, user)


@router.delete("/{portfolio_id}/holdings/{holding_id}")
def delete_holding(portfolio_id: str, holding_id: str, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db), snap: MarketSnapshot = Depends(get_snapshot)):
    p = A.get_owned_portfolio(db, user, portfolio_id)
    h = next((x for x in p.holdings if x.id == holding_id), None)
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holding not found")
    db.delete(h)
    db.commit()
    db.refresh(p)
    return _detail(p, snap, user)


@router.get("/{portfolio_id}/overview")
def overview(portfolio_id: str, lookback_days: int | None = Query(default=None, ge=60, le=2520),
             user: User = Depends(get_current_user), db: Session = Depends(get_db),
             snap: MarketSnapshot = Depends(get_snapshot)):
    """Dashboard payload: what do I own, what is it worth, how has it done, how risky is it, what next."""
    p = A.get_owned_portfolio(db, user, portfolio_id)
    prefs = A.preferences(user)
    val = A.valuation(snap, p)
    base = {"portfolio": {"id": p.id, "name": p.name, "description": p.description,
                          "is_default": user.default_portfolio_id == p.id},
            "valuation": val, "risk": None, "performance": None, "insights": []}
    priced = [h for h in val["holdings"] if h["priced"] and h["current_value"]]
    if not priced:
        return A.sanitize(base)

    class _Req:  # settings for this view come from preferences, with an optional lookback override
        pass

    req = _Req()
    req.lookback_days = lookback_days
    ctx = A.Context([h["ticker"] for h in priced], {h["ticker"]: h["weight"] for h in priced}, val["current_value"], p, val)
    inp = A.build_inputs(snap, ctx.tickers, req, prefs)
    risk = A.risk_payload(snap, inp, ctx, prefs["confidence"], 1)

    # Performance of today's holdings over the window (hypothetical: assumes the same quantities were held).
    qty = {h["ticker"]: h["quantity"] for h in priced}
    px = snap.close[list(qty)].dropna()
    first = max(int(px.index.searchsorted(inp.returns.index[0])) - 1, 0)  # the close before the first return
    px = px.iloc[first:]
    values = (px * pd.Series(qty)).sum(axis=1)
    bench = snap.adjusted["SPY"].reindex(values.index) if "SPY" in snap.adjusted else None
    step = max(1, len(values) // 300)
    perf = [{"date": d.date().isoformat(), "value": float(v),
             "benchmark": float(bench.loc[d] / bench.iloc[0] * values.iloc[0]) if bench is not None else None}
            for d, v in list(values.items())[::step]]
    if perf[-1]["date"] != values.index[-1].date().isoformat():
        d = values.index[-1]
        perf.append({"date": d.date().isoformat(), "value": float(values.iloc[-1]),
                     "benchmark": float(bench.iloc[-1] / bench.iloc[0] * values.iloc[0]) if bench is not None else None})
    period_ret = float(values.iloc[-1] / values.iloc[0] - 1)
    bench_ret = float(bench.iloc[-1] / bench.iloc[0] - 1) if bench is not None else None
    rolling = (values.pct_change(fill_method=None).add(1).rolling(63).apply(lambda x: x.prod(), raw=True) - 1).dropna()
    base.update({
        "risk": {k: risk[k] for k in ("metrics", "money", "risk_contribution", "correlation", "concentration",
                                       "sector_exposure", "sector_risk", "drawdown", "inputs", "factor_exposure")},
        "performance": {"series": perf, "period_return": period_ret, "benchmark_return": bench_ret,
                        "rolling_63d": float(rolling.iloc[-1]) if len(rolling) else None,
                        "drawdown_series": [{"date": s["date"], "drawdown": s["drawdown"]} for s in risk["series"]]},
        "insights": A.insights(val, risk),
    })
    return A.sanitize(base)
