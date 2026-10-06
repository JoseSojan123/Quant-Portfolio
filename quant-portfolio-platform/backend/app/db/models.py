"""Database schema (blueprint section 7 + V2 addendum section 6).

Market data      assets, prices_daily, returns_daily, data_updates
Users            users (auth handled by the API: bcrypt hashes, JWT sessions)
Portfolios       portfolios, portfolio_holdings
Saved results    optimization_runs, portfolio_weights, risk_metrics, stress_results,
                 rebalance_runs, rebalance_items, saved_scenarios

Every user-owned table carries an owner/user id, and every API query filters on it
so one user can never read another user's portfolios.
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Timezone-aware UTC datetimes on every backend (SQLite drops tzinfo on read)."""
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Base(DeclarativeBase):
    pass


# --- market data ---------------------------------------------------------------------------


class Asset(Base):
    __tablename__ = "assets"
    asset_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    sector: Mapped[str] = mapped_column(String(64))
    asset_type: Mapped[str] = mapped_column(String(16), default="Stock")
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    is_benchmark: Mapped[bool] = mapped_column(Boolean, default=False)


class PriceDaily(Base):
    __tablename__ = "prices_daily"
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.asset_id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    adjusted_close: Mapped[float] = mapped_column(Float)
    volume: Mapped[int | None] = mapped_column(BigInteger)
    source: Mapped[str] = mapped_column(String(32))
    downloaded_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)

    __table_args__ = (Index("ix_prices_daily_date", "date"),)


class ReturnDaily(Base):
    __tablename__ = "returns_daily"
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.asset_id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    simple_return: Mapped[float] = mapped_column(Float)
    log_return: Mapped[float] = mapped_column(Float)


class DataUpdate(Base):
    """One row per pipeline run: the "data last updated" timestamp comes from here."""
    __tablename__ = "data_updates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)
    finished_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime())
    status: Mapped[str] = mapped_column(String(16), default="running")  # running | success | failed
    source: Mapped[str] = mapped_column(String(32))
    rows_upserted: Mapped[int] = mapped_column(Integer, default=0)
    first_date: Mapped[dt.date | None] = mapped_column(Date)
    last_date: Mapped[dt.date | None] = mapped_column(Date)
    message: Mapped[str | None] = mapped_column(Text)
    report: Mapped[dict | None] = mapped_column(JSON)


# --- users & portfolios ----------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    default_portfolio_id: Mapped[str | None] = mapped_column(String(36))
    terms_accepted_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now, onupdate=_now)
    last_login_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime())

    portfolios: Mapped[list[Portfolio]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Portfolio(Base):
    __tablename__ = "portfolios"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    base_currency: Mapped[str] = mapped_column(String(8), default="USD")
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now, onupdate=_now)

    owner: Mapped[User] = relationship(back_populates="portfolios")
    holdings: Mapped[list[Holding]] = relationship(back_populates="portfolio", cascade="all, delete-orphan",
                                                   order_by="Holding.created_at")


class Holding(Base):
    __tablename__ = "portfolio_holdings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), index=True)
    ticker: Mapped[str] = mapped_column(String(16))
    quantity: Mapped[float] = mapped_column(Float)
    average_cost: Mapped[float] = mapped_column(Float)
    asset_type: Mapped[str | None] = mapped_column(String(16))
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now, onupdate=_now)

    portfolio: Mapped[Portfolio] = relationship(back_populates="holdings")
    __table_args__ = (UniqueConstraint("portfolio_id", "ticker", name="uq_holding_portfolio_ticker"),)


# --- saved analytics -------------------------------------------------------------------------------


class OptimizationRun(Base):
    __tablename__ = "optimization_runs"
    run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    portfolio_id: Mapped[str | None] = mapped_column(ForeignKey("portfolios.id", ondelete="SET NULL"))
    name: Mapped[str | None] = mapped_column(String(120))
    objective: Mapped[str] = mapped_column(String(32))
    capital: Mapped[float] = mapped_column(Float)
    request: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)


class PortfolioWeight(Base):
    __tablename__ = "portfolio_weights"
    run_id: Mapped[str] = mapped_column(ForeignKey("optimization_runs.run_id", ondelete="CASCADE"), primary_key=True)
    ticker: Mapped[str] = mapped_column(String(16), primary_key=True)
    weight: Mapped[float] = mapped_column(Float)
    current_weight: Mapped[float | None] = mapped_column(Float)


class RiskMetric(Base):
    __tablename__ = "risk_metrics"
    run_id: Mapped[str] = mapped_column(ForeignKey("optimization_runs.run_id", ondelete="CASCADE"), primary_key=True)
    expected_return: Mapped[float | None] = mapped_column(Float)
    volatility: Mapped[float | None] = mapped_column(Float)
    sharpe: Mapped[float | None] = mapped_column(Float)
    var_95: Mapped[float | None] = mapped_column(Float)
    es_95: Mapped[float | None] = mapped_column(Float)
    max_drawdown: Mapped[float | None] = mapped_column(Float)


class StressResult(Base):
    __tablename__ = "stress_results"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    portfolio_id: Mapped[str | None] = mapped_column(ForeignKey("portfolios.id", ondelete="SET NULL"))
    run_id: Mapped[str | None] = mapped_column(ForeignKey("optimization_runs.run_id", ondelete="SET NULL"))
    scenario: Mapped[str] = mapped_column(String(64))
    pnl: Mapped[float] = mapped_column(Float)
    loss_pct: Mapped[float] = mapped_column(Float)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)


class RebalanceRun(Base):
    __tablename__ = "rebalance_runs"
    run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    portfolio_id: Mapped[str | None] = mapped_column(ForeignKey("portfolios.id", ondelete="SET NULL"))
    turnover: Mapped[float] = mapped_column(Float)
    cost: Mapped[float] = mapped_column(Float)
    cost_rate: Mapped[float] = mapped_column(Float)
    threshold: Mapped[float] = mapped_column(Float)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)


class RebalanceItem(Base):
    __tablename__ = "rebalance_items"
    run_id: Mapped[str] = mapped_column(ForeignKey("rebalance_runs.run_id", ondelete="CASCADE"), primary_key=True)
    ticker: Mapped[str] = mapped_column(String(16), primary_key=True)
    current_weight: Mapped[float] = mapped_column(Float)
    target_weight: Mapped[float] = mapped_column(Float)
    trade_value: Mapped[float] = mapped_column(Float)


class SavedScenario(Base):
    __tablename__ = "saved_scenarios"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    portfolio_id: Mapped[str | None] = mapped_column(ForeignKey("portfolios.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(16))  # stress | what_if
    config: Mapped[dict] = mapped_column(JSON)
    summary: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime(), default=_now)
