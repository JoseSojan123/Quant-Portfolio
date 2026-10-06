from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ratelimit import limiter
from app.core.security import decode_token
from app.db.models import User
from app.db.session import get_db
from app.services.market_data import MarketSnapshot, store


def _token_from(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(get_settings().cookie_name)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _token_from(request)
    payload = decode_token(token, "access") if token else None
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    user = db.get(User, payload.get("sub"))
    if user is None or user.token_version != payload.get("ver"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    return user


def get_snapshot(db: Session = Depends(get_db)) -> MarketSnapshot:
    snap = store.get(db)
    if snap.adjusted.empty:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Market data has not been loaded yet")
    return snap


def heavy_rate_limit(request: Request, user: User = Depends(get_current_user)) -> None:
    limiter.check(f"heavy:{user.id}", get_settings().heavy_rate_limit_per_minute)


def auth_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        ip = fwd.split(",")[0].strip()
    limiter.check(f"auth:{ip}", get_settings().auth_rate_limit_per_minute)
