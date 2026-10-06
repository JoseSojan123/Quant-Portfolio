"""Application settings, read from environment variables (and an optional .env file).

Secrets (JWT secret, database password, SMTP password) only ever come from the
environment. Nothing secret is committed to the repository.
"""

from __future__ import annotations

import json
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"),
                                      env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Quantitative Portfolio Platform API"
    app_version: str = "1.0.0"
    app_env: str = "development"  # development | production | test

    database_url: str = f"sqlite:///{DATA_DIR / 'app.db'}"

    jwt_secret: str = ""
    access_token_days: int = 7
    remember_me_days: int = 30
    cookie_name: str = "qp_session"
    cookie_secure: bool | None = None
    cookie_samesite: str = "lax"

    frontend_url: str = "http://localhost:3000"
    # NoDecode keeps pydantic-settings from trying to JSON-decode the env value, so
    # CORS_ORIGINS can be the comma-separated list that .env.example documents.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    require_email_verification: bool = True
    expose_dev_links: bool | None = None  # return verify/reset links in API responses (dev only)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "Quant Portfolio Platform <no-reply@example.com>"

    auto_seed: bool = True
    data_source: str = "synthetic"
    github_url: str = "https://github.com/your-username/quant-portfolio-platform"

    heavy_rate_limit_per_minute: int = 40
    auth_rate_limit_per_minute: int = 20
    max_mc_simulations: int = 20_000
    max_mc_horizon_days: int = 2520
    max_mc_cells: int = 6_000_000  # simulations x horizon
    guest_ttl_hours: int = 48

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            raw = v.strip()
            if raw.startswith("["):          # a JSON array is accepted too
                return json.loads(raw)
            return [o.strip() for o in raw.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def secure_cookies(self) -> bool:
        return self.is_production if self.cookie_secure is None else self.cookie_secure

    @property
    def dev_links(self) -> bool:
        return (not self.is_production) if self.expose_dev_links is None else self.expose_dev_links


def _resolve_jwt_secret(s: Settings) -> str:
    if s.jwt_secret:
        return s.jwt_secret
    if s.is_production:
        raise RuntimeError("JWT_SECRET must be set in production")
    # Development: generate once and keep it on disk so sessions survive restarts.
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / ".jwt_secret"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48))
    return path.read_text().strip()


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.jwt_secret = _resolve_jwt_secret(s)
    if s.frontend_url not in s.cors_origins:
        s.cors_origins.append(s.frontend_url)
    if s.database_url.startswith("sqlite:///"):
        Path(s.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    # Supabase / Heroku style URLs use postgres://, which SQLAlchemy 2 does not accept.
    if s.database_url.startswith("postgres://"):
        s.database_url = "postgresql://" + s.database_url.removeprefix("postgres://")
    return s
