"""Password hashing, session tokens and one-time (verify / reset) tokens."""

from __future__ import annotations

import datetime as dt
import hashlib

import bcrypt
import jwt

from app.core.config import get_settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def create_access_token(user_id: str, token_version: int, days: int) -> str:
    s = get_settings()
    payload = {"sub": user_id, "ver": token_version, "typ": "access", "iat": _now(),
               "exp": _now() + dt.timedelta(days=days)}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != expected_type:
        return None
    return payload


def password_fingerprint(password_hash: str) -> str:
    """Short hash of the stored password hash: changes whenever the password changes,
    so a reset link stops working once it has been used."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_one_time_token(user_id: str, purpose: str, hours: float, fingerprint: str = "") -> str:
    s = get_settings()
    payload = {"sub": user_id, "typ": purpose, "fp": fingerprint, "iat": _now(),
               "exp": _now() + dt.timedelta(hours=hours)}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM)
