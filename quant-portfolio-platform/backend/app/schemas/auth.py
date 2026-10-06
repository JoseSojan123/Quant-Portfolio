from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, EmailStr, Field, field_validator


def _strong(pw: str) -> str:
    if len(pw) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.isalpha() for c in pw) or not any(c.isdigit() for c in pw):
        raise ValueError("Password must contain at least one letter and one number")
    return pw


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(max_length=128)
    accept_terms: bool

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _strong(v)

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, v: bool) -> bool:
        if not v:
            raise ValueError("You must accept the terms and privacy notice")
        return v

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name is required")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    remember_me: bool = True


class EmailRequest(BaseModel):
    email: EmailStr


class TokenRequest(BaseModel):
    token: str = Field(max_length=2048)


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=2048)
    password: str = Field(max_length=128)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _strong(v)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _strong(v)


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    email_verified: bool
    is_guest: bool
    onboarded: bool
    default_portfolio_id: str | None
    preferences: dict
    created_at: dt.datetime
    last_login_at: dt.datetime | None


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)


class AuthResponse(BaseModel):
    user: UserOut | None = None
    message: str | None = None
    dev_link: str | None = None
    requires_verification: bool = False


class Preferences(BaseModel):
    risk_free_rate: float = Field(0.04, ge=-0.05, le=0.25)
    lookback_days: int = Field(756, ge=60, le=2520)
    confidence: float = Field(0.95, ge=0.8, le=0.999)
    cost_rate: float = Field(0.001, ge=0, le=0.05)
    rebalance_threshold: float = Field(0.05, ge=0, le=0.5)
    return_method: str = Field("historical", pattern="^(historical|bayes_stein|capm)$")
    cov_method: str = Field("sample", pattern="^(sample|ledoit_wolf|ewma)$")
    default_objective: str = Field("max_sharpe", pattern="^(min_variance|max_sharpe|target_return|risk_parity|equal_weight)$")
    max_weight: float = Field(0.3, gt=0, le=1)
    mc_sims: int = Field(5000, ge=100, le=20000)
    mc_horizon_days: int = Field(252, ge=5, le=2520)
