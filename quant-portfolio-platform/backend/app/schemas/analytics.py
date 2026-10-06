"""Request bodies for the analytics endpoints.

Every analytics request describes *which* portfolio to analyse in one of two ways:

* ``portfolio_id`` - a saved portfolio; weights come from its holdings at current prices.
* ``assets`` (+ optional ``weights``, ``capital``) - an ad-hoc portfolio, as in the
  blueprint's Portfolio Builder. Missing weights default to equal weight.

Analysis settings left out fall back to the user's saved preferences.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Objective = Literal["min_variance", "max_sharpe", "target_return", "risk_parity", "equal_weight"]


class PortfolioSpec(BaseModel):
    portfolio_id: str | None = None
    assets: list[str] | None = Field(default=None, max_length=60)
    weights: dict[str, float] | None = None
    capital: float | None = Field(default=None, gt=0, le=1e12)

    @field_validator("assets")
    @classmethod
    def _clean_assets(cls, v):
        if v is None:
            return v
        out = []
        for t in v:
            u = t.strip().upper()
            if u and u not in out:
                out.append(u)
        return out

    @field_validator("weights")
    @classmethod
    def _clean_weights(cls, v):
        if v is None:
            return v
        return {k.strip().upper(): float(w) for k, w in v.items()}

    @model_validator(mode="after")
    def _one_source(self):
        if not self.portfolio_id and not self.assets and not self.weights:
            raise ValueError("Provide portfolio_id, or assets (and optionally weights)")
        return self


class AnalysisSettings(BaseModel):
    lookback_days: int | None = Field(default=None, ge=60, le=2520)
    return_method: Literal["historical", "bayes_stein", "capm"] | None = None
    cov_method: Literal["sample", "ledoit_wolf", "ewma"] | None = None
    risk_free_rate: float | None = Field(default=None, ge=-0.05, le=0.25)


class ConstraintSpec(BaseModel):
    long_only: bool = True
    max_single_asset: float | None = Field(default=None, gt=0, le=1)
    min_weight: float = Field(default=0.0, ge=0, le=0.5)
    sector_caps: dict[str, float] = Field(default_factory=dict)
    cash_floor: float = Field(default=0.0, ge=0, le=0.9)
    target_return: float | None = Field(default=None, ge=-1, le=5)
    turnover_cap: float | None = Field(default=None, gt=0, le=2)

    @field_validator("sector_caps")
    @classmethod
    def _caps(cls, v):
        for k, c in v.items():
            if not 0 < c <= 1:
                raise ValueError(f"sector cap for {k} must be in (0, 1]")
        return v


class OptimizeRequest(PortfolioSpec, AnalysisSettings, ConstraintSpec):
    objective: Objective = "max_sharpe"
    save: bool = False
    name: str | None = Field(default=None, max_length=120)


class FrontierRequest(PortfolioSpec, AnalysisSettings, ConstraintSpec):
    n_points: int = Field(default=30, ge=5, le=60)
    objective: Objective = "max_sharpe"


class RiskRequest(PortfolioSpec, AnalysisSettings):
    confidence: float | None = Field(default=None, ge=0.8, le=0.999)
    horizon_days: int = Field(default=1, ge=1, le=60)


class CustomScenarioSpec(BaseModel):
    name: str = Field(default="Custom scenario", max_length=120)
    shocks: dict[str, float] = Field(default_factory=dict)
    sector_shocks: dict[str, float] = Field(default_factory=dict)

    @field_validator("shocks", "sector_shocks")
    @classmethod
    def _bounds(cls, v):
        for k, s in v.items():
            if not -1 <= s <= 5:
                raise ValueError(f"shock for {k} must be between -100% and +500%")
        return v


class StressRequest(PortfolioSpec, AnalysisSettings):
    scenario_ids: list[str] | None = None  # None = all predefined
    custom: CustomScenarioSpec | None = None
    save: bool = False


class MonteCarloRequest(PortfolioSpec, AnalysisSettings):
    horizon_days: int | None = Field(default=None, ge=5, le=2520)
    n_sims: int | None = Field(default=None, ge=100, le=20000)
    method: Literal["normal", "student_t", "bootstrap"] = "normal"
    target_value: float | None = Field(default=None, gt=0)
    loss_threshold: float = Field(default=0.10, gt=0, lt=1)
    seed: int | None = Field(default=42, ge=0, le=2**31)


class RebalanceRequest(PortfolioSpec, AnalysisSettings):
    target_weights: dict[str, float] | None = None
    target_run_id: str | None = None
    target_objective: Objective | None = None
    max_single_asset: float | None = Field(default=None, gt=0, le=1)
    cost_rate: float | None = Field(default=None, ge=0, le=0.05)
    threshold: float | None = Field(default=None, ge=0, le=0.5)
    whole_shares: bool = False
    force: bool = False
    save: bool = False


class BacktestRequest(PortfolioSpec, AnalysisSettings):
    strategies: list[Literal["equal_weight", "min_variance", "max_sharpe", "risk_parity", "current"]] = Field(
        default_factory=lambda: ["equal_weight", "min_variance", "max_sharpe", "risk_parity", "current"])
    frequency: Literal["monthly", "quarterly", "annual"] = "monthly"
    estimation_window: int = Field(default=252, ge=60, le=1260)
    cost_rate: float | None = Field(default=None, ge=0, le=0.05)
    max_single_asset: float | None = Field(default=None, gt=0, le=1)
    start_date: str | None = None


class WhatIfAction(BaseModel):
    type: Literal["add_cash", "asset_shock", "market_shock", "reduce_holding", "rebalance_to"]
    amount: float | None = Field(default=None, gt=0, le=1e10)
    ticker: str | None = None
    shock: float | None = Field(default=None, ge=-1, le=5)
    percentage_points: float | None = Field(default=None, gt=0, le=1)
    weights: dict[str, float] | None = None
    run_id: str | None = None


class WhatIfRequest(AnalysisSettings):
    portfolio_id: str
    action: WhatIfAction
    cost_rate: float | None = Field(default=None, ge=0, le=0.05)
    save: bool = False
    name: str | None = Field(default=None, max_length=120)


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["stress", "what_if"]
    portfolio_id: str | None = None
    config: dict
    summary: dict | None = None
