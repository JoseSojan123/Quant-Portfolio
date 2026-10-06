"""Stress testing (blueprint Stage 9, KB section 13).

A stress test deliberately applies a severe, hypothetical shock and asks what
happens to *this* portfolio. Unlike Monte Carlo it does not describe a
distribution of outcomes; it examines one chosen adverse scenario.

Scenario kinds
  beta        shock the market by X; each asset moves beta_i x X (beta vs SPY)
  rules       shocks by sector / tag / ticker (first matching rule wins:
              ticker > tag > sector)
  historical  replay the actual asset moves between two dates in the dataset
  custom      user-entered asset-level shocks

For each scenario: portfolio P&L, % change, before/after value, every asset's
contribution and the largest loss contributors.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class Scenario:
    id: str
    name: str
    description: str
    kind: str  # beta | rules | historical | custom
    market_shock: float | None = None
    sector_shocks: dict[str, float] = field(default_factory=dict)
    tag_shocks: dict[str, float] = field(default_factory=dict)
    ticker_shocks: dict[str, float] = field(default_factory=dict)
    start: str | None = None
    end: str | None = None

    def assumptions(self) -> list[str]:
        out = []
        if self.kind == "beta" and self.market_shock is not None:
            out.append(f"Market (SPY) {self.market_shock:+.0%}; each asset moves by its beta x market shock")
        for s, v in self.sector_shocks.items():
            out.append(f"{s} sector {v:+.0%}")
        for t, v in self.tag_shocks.items():
            out.append(f"{t.replace('_', ' ')} assets {v:+.0%}")
        for t, v in self.ticker_shocks.items():
            out.append(f"{t} {v:+.0%}")
        if self.kind == "historical":
            out.append(f"Actual moves from {self.start} to {self.end} in the loaded dataset")
        if self.kind == "rules":
            out.append("All other holdings unchanged")
        return out

    def as_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "description": self.description, "kind": self.kind,
                "assumptions": self.assumptions(), "start": self.start, "end": self.end}


PREDEFINED_SCENARIOS: list[Scenario] = [
    Scenario("market_crash", "Broad market crash",
             "The S&P 500 falls 20%. Each holding falls in proportion to its estimated market beta.",
             "beta", market_shock=-0.20),
    Scenario("tech_selloff", "Technology sell-off",
             "Technology stocks fall 25% and communication-services platforms 15%; tech-heavy ETFs fall 18%.",
             "rules", sector_shocks={"Technology": -0.25, "Communication Services": -0.15}, tag_shocks={"tech_heavy": -0.18}),
    Scenario("rate_shock", "Interest-rate shock",
             "Rates jump sharply. Rate-sensitive assets (utilities, REITs, long bonds) fall 15%; "
             "intermediate Treasuries fall 6%; banks gain modestly.",
             "rules", tag_shocks={"rate_sensitive": -0.15, "intermediate_duration": -0.06},
             sector_shocks={"Financials": 0.03}),
    Scenario("energy_spike", "Energy price spike",
             "Oil spikes: energy assets rise 20% and consumer-discretionary names fall 5% as fuel costs bite.",
             "rules", sector_shocks={"Energy": 0.20, "Consumer Discretionary": -0.05}),
    Scenario("energy_collapse", "Energy price collapse",
             "Oil collapses: energy assets fall 20%; everything else unchanged.",
             "rules", sector_shocks={"Energy": -0.20}),
    Scenario("covid_2020", "Historical replay: COVID crash (Feb-Mar 2020)",
             "Replays every asset's actual move from the February 2020 peak to the March 2020 trough.",
             "historical", start="2020-02-19", end="2020-03-23"),
    Scenario("bear_2022", "Historical replay: 2022 bear market",
             "Replays the 2022 inflation and rate-hike bear market, January to October 2022.",
             "historical", start="2022-01-03", end="2022-10-12"),
    Scenario("tariff_2025", "Historical replay: April 2025 tariff shock",
             "Replays the sharp sell-off after the April 2025 tariff announcement.",
             "historical", start="2025-04-02", end="2025-04-08"),
]
SCENARIOS_BY_ID = {s.id: s for s in PREDEFINED_SCENARIOS}


def scenario_shocks(scenario: Scenario, tickers: list[str], meta: dict[str, dict], betas: dict[str, float] | None = None,
                    prices: pd.DataFrame | None = None) -> tuple[dict[str, float], list[str]]:
    """Asset-level shock for every ticker, plus notes about anything approximated."""
    notes: list[str] = []
    shocks: dict[str, float] = {}
    for t in tickers:
        if t == "CASH":
            shocks[t] = 0.0
            continue
        m = meta.get(t, {})
        if scenario.kind == "beta":
            b = (betas or {}).get(t)
            if b is None or not np.isfinite(b):
                b = 1.0
                notes.append(f"{t}: beta unavailable, assumed 1.0")
            shocks[t] = max(-1.0, b * float(scenario.market_shock or 0.0))
        elif scenario.kind in ("rules", "custom"):
            if t in scenario.ticker_shocks:
                shocks[t] = scenario.ticker_shocks[t]
            elif any(tag in scenario.tag_shocks for tag in m.get("tags", [])):
                tag = next(tag for tag in m.get("tags", []) if tag in scenario.tag_shocks)
                shocks[t] = scenario.tag_shocks[tag]
            else:
                shocks[t] = scenario.sector_shocks.get(m.get("sector", ""), 0.0)
        elif scenario.kind == "historical":
            if prices is None or t not in prices.columns:
                shocks[t] = 0.0
                notes.append(f"{t}: no price history, assumed unchanged")
                continue
            s = prices[t].dropna()
            window = s[(s.index >= pd.Timestamp(scenario.start)) & (s.index <= pd.Timestamp(scenario.end))]
            before = s[s.index <= pd.Timestamp(scenario.start)]
            if len(window) < 2 or before.empty:
                shocks[t] = 0.0
                notes.append(f"{t}: no data for {scenario.start} to {scenario.end}, assumed unchanged")
                continue
            shocks[t] = float(window.iloc[-1] / before.iloc[-1] - 1.0)
        else:
            raise ValueError(f"unknown scenario kind {scenario.kind!r}")
    return shocks, notes


def apply_shocks(weights: dict[str, float], portfolio_value: float, shocks: dict[str, float]) -> dict:
    rows = []
    for t, w in weights.items():
        if abs(w) < 1e-12:
            continue
        value = w * portfolio_value
        shock = float(shocks.get(t, 0.0))
        pnl = value * shock
        rows.append({"ticker": t, "weight": float(w), "value_before": value, "shock": shock,
                     "pnl": pnl, "value_after": value + pnl})
    total_pnl = float(sum(r["pnl"] for r in rows))
    total_loss = sum(r["pnl"] for r in rows if r["pnl"] < 0)
    for r in rows:
        r["contribution_pct"] = r["pnl"] / portfolio_value if portfolio_value else 0.0
        r["share_of_loss"] = (r["pnl"] / total_loss) if (total_loss < 0 and r["pnl"] < 0) else 0.0
    rows.sort(key=lambda r: r["pnl"])
    return {
        "value_before": float(portfolio_value), "value_after": float(portfolio_value + total_pnl),
        "pnl": total_pnl, "pct_change": total_pnl / portfolio_value if portfolio_value else 0.0,
        "contributions": rows,
        "largest_contributors": [r for r in rows if r["pnl"] < 0][:3],
    }


def run_stress_test(scenario: Scenario, weights: dict[str, float], portfolio_value: float, meta: dict[str, dict],
                    betas: dict[str, float] | None = None, prices: pd.DataFrame | None = None) -> dict:
    shocks, notes = scenario_shocks(scenario, list(weights), meta, betas, prices)
    res = apply_shocks(weights, portfolio_value, shocks)
    res["scenario"] = scenario.as_dict()
    res["notes"] = notes
    res["disclaimer"] = "Hypothetical scenario: it shows sensitivity to an assumed shock, not a forecast."
    return res


def custom_scenario(ticker_shocks: dict[str, float], name: str = "Custom scenario",
                    sector_shocks: dict[str, float] | None = None) -> Scenario:
    return Scenario("custom", name, "User-defined asset and sector shocks.", "custom",
                    ticker_shocks={k.upper(): float(v) for k, v in ticker_shocks.items()},
                    sector_shocks=dict(sector_shocks or {}))
