"""Authentication: signup, email verification, login/logout, password recovery, demo accounts.

Sessions are JWTs in an httpOnly, SameSite=Lax cookie (also accepted as a Bearer
header for API clients). Logging out everywhere bumps ``token_version``, which
invalidates every outstanding token for that user.
"""

from __future__ import annotations

import datetime as dt
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import auth_rate_limit, get_current_user
from app.core.config import get_settings
from app.core.email import send_email
from app.core.security import (
    create_access_token,
    create_one_time_token,
    decode_token,
    hash_password,
    password_fingerprint,
    verify_password,
)
from app.db.models import Holding, Portfolio, User
from app.db.session import get_db
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    EmailRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenRequest,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_RESET_MESSAGE = "If an account exists for that email, a password-reset link has been sent."

DEMO_HOLDINGS = [
    ("NVDA", 60, 118.0), ("MSFT", 14, 415.0), ("AAPL", 30, 192.0), ("GOOGL", 20, 168.0),
    ("JPM", 18, 205.0), ("XOM", 30, 108.0), ("JNJ", 15, 158.0), ("TLT", 40, 93.0), ("GLD", 12, 230.0),
]


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, full_name=u.full_name, email_verified=u.email_verified,
                   is_guest=u.is_guest, onboarded=bool(u.portfolios), default_portfolio_id=u.default_portfolio_id,
                   preferences=u.preferences or {}, created_at=u.created_at, last_login_at=u.last_login_at)


def set_session(response: Response, user: User, remember: bool) -> None:
    s = get_settings()
    days = s.remember_me_days if remember else s.access_token_days
    token = create_access_token(user.id, user.token_version, days)
    response.set_cookie(s.cookie_name, token, max_age=days * 86400 if remember else None, httponly=True,
                        secure=s.secure_cookies, samesite=s.cookie_samesite, path="/")


def clear_session(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(s.cookie_name, path="/", httponly=True, secure=s.secure_cookies, samesite=s.cookie_samesite)


def _send_verification(user: User) -> str:
    s = get_settings()
    token = create_one_time_token(user.id, "verify", hours=48)
    link = f"{s.frontend_url}/verify-email?token={token}"
    send_email(user.email, "Verify your email",
               f"Hi {user.full_name},\n\nConfirm your email address to finish creating your account:\n{link}\n\n"
               "The link expires in 48 hours.")
    return link


@router.post("/signup", response_model=AuthResponse, status_code=201, dependencies=[Depends(auth_rate_limit)])
def signup(body: SignupRequest, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Try signing in.")
    user = User(email=email, full_name=body.full_name, password_hash=hash_password(body.password),
                email_verified=not s.require_email_verification,
                terms_accepted_at=dt.datetime.now(dt.timezone.utc))
    db.add(user)
    db.commit()
    if s.require_email_verification:
        link = _send_verification(user)
        return AuthResponse(message="Account created. Check your email to verify your address.",
                            requires_verification=True, dev_link=link if s.dev_links else None)
    set_session(response, user, True)
    return AuthResponse(user=user_out(user), message="Account created.")


@router.post("/verify-email", response_model=AuthResponse)
def verify_email(body: TokenRequest, response: Response, db: Session = Depends(get_db)):
    payload = decode_token(body.token, "verify")
    user = db.get(User, payload["sub"]) if payload else None
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This verification link is invalid or has expired.")
    user.email_verified = True
    user.last_login_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    set_session(response, user, True)
    return AuthResponse(user=user_out(user), message="Email verified.")


@router.post("/resend-verification", response_model=AuthResponse, dependencies=[Depends(auth_rate_limit)])
def resend_verification(body: EmailRequest, db: Session = Depends(get_db)):
    s = get_settings()
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    link = None
    if user and not user.email_verified:
        link = _send_verification(user)
    return AuthResponse(message="If that account still needs verification, a new link has been sent.",
                        dev_link=link if s.dev_links else None)


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(auth_rate_limit)])
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or user.is_guest or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    if s.require_email_verification and not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Please verify your email before signing in. You can request a new link below.")
    user.last_login_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    set_session(response, user, body.remember_me)
    return AuthResponse(user=user_out(user))


@router.post("/logout", response_model=AuthResponse)
def logout(response: Response):
    clear_session(response)
    return AuthResponse(message="Signed out.")


@router.post("/logout-all", response_model=AuthResponse)
def logout_all(response: Response, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.token_version += 1
    db.commit()
    clear_session(response)
    return AuthResponse(message="Signed out of every device.")


@router.post("/forgot-password", response_model=AuthResponse, dependencies=[Depends(auth_rate_limit)])
def forgot_password(body: EmailRequest, db: Session = Depends(get_db)):
    s = get_settings()
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    link = None
    if user and not user.is_guest:
        token = create_one_time_token(user.id, "reset", hours=1, fingerprint=password_fingerprint(user.password_hash))
        link = f"{s.frontend_url}/reset-password?token={token}"
        send_email(user.email, "Reset your password",
                   f"Hi {user.full_name},\n\nReset your password with this link (valid for 1 hour):\n{link}\n\n"
                   "If you did not ask for this, you can ignore this email.")
    # Same response whether or not the account exists, so emails cannot be enumerated.
    return AuthResponse(message=GENERIC_RESET_MESSAGE, dev_link=link if s.dev_links else None)


@router.post("/reset-password", response_model=AuthResponse, dependencies=[Depends(auth_rate_limit)])
def reset_password(body: ResetPasswordRequest, response: Response, db: Session = Depends(get_db)):
    payload = decode_token(body.token, "reset")
    user = db.get(User, payload["sub"]) if payload else None
    if user is None or payload.get("fp") != password_fingerprint(user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid, expired or already used.")
    user.password_hash = hash_password(body.password)
    user.token_version += 1  # sign out every existing session
    user.email_verified = True  # they proved control of the inbox
    db.commit()
    set_session(response, user, True)
    return AuthResponse(user=user_out(user), message="Password updated.")


@router.post("/change-password", response_model=AuthResponse)
def change_password(body: ChangePasswordRequest, response: Response, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if user.is_guest:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Demo accounts have no password. Create an account instead.")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    db.commit()
    set_session(response, user, True)  # keep this device signed in
    return AuthResponse(user=user_out(user), message="Password changed. Other devices have been signed out.")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.post("/demo", response_model=AuthResponse, dependencies=[Depends(auth_rate_limit)])
def demo(request: Request, response: Response, db: Session = Depends(get_db)):
    """Create a throwaway, isolated demo account with a sample portfolio (public demo flow)."""
    s = get_settings()
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=s.guest_ttl_hours)
    db.execute(delete(User).where(User.is_guest.is_(True), User.created_at < cutoff))
    user = User(email=f"guest-{secrets.token_hex(6)}@demo.invalid", full_name="Demo Investor",
                password_hash=hash_password(secrets.token_urlsafe(24)), email_verified=True, is_guest=True,
                last_login_at=dt.datetime.now(dt.timezone.utc))
    db.add(user)
    db.flush()
    p = Portfolio(owner_id=user.id, name="Demo growth portfolio",
                  description="Sample holdings so you can explore every feature. Edit freely.")
    db.add(p)
    db.flush()
    for t, q, c in DEMO_HOLDINGS:
        db.add(Holding(portfolio_id=p.id, ticker=t, quantity=q, average_cost=c))
    user.default_portfolio_id = p.id
    db.commit()
    db.refresh(user)
    set_session(response, user, False)
    return AuthResponse(user=user_out(user), message="Demo account ready.")
