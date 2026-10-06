from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field, field_validator


class HoldingIn(BaseModel):
    ticker: str = Field(min_length=1, max_length=16)
    quantity: float = Field(gt=0, le=1e9)
    average_cost: float = Field(gt=0, le=1e7)
    asset_type: str | None = Field(default=None, max_length=16)
    currency: str = Field(default="USD", max_length=8)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("ticker")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


class HoldingUpdate(BaseModel):
    quantity: float | None = Field(default=None, gt=0, le=1e9)
    average_cost: float | None = Field(default=None, gt=0, le=1e7)
    asset_type: str | None = Field(default=None, max_length=16)
    currency: str | None = Field(default=None, max_length=8)
    notes: str | None = Field(default=None, max_length=500)


class HoldingOut(BaseModel):
    id: str
    ticker: str
    quantity: float
    average_cost: float
    asset_type: str | None
    currency: str
    notes: str | None
    created_at: dt.datetime


class PortfolioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    base_currency: str = Field(default="USD", max_length=8)
    holdings: list[HoldingIn] = Field(default_factory=list, max_length=100)
    make_default: bool = False


class PortfolioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)


class PortfolioSummary(BaseModel):
    id: str
    name: str
    description: str | None
    base_currency: str
    created_at: dt.datetime
    updated_at: dt.datetime
    holdings_count: int
    current_value: float | None
    invested_value: float | None
    unrealized_pnl: float | None
    is_default: bool
