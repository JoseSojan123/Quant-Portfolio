"""Price-data validation and cleaning (blueprint Stage 1).

Steps: standardize dates and tickers -> remove duplicates -> check missing values ->
check non-positive prices -> flag stale prices. Every step is recorded in a
``ValidationReport`` so the pipeline can log exactly what it changed.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

REQUIRED_COLUMNS = ["date", "ticker", "adjusted_close"]


@dataclass
class ValidationReport:
    rows_in: int = 0
    rows_out: int = 0
    duplicates_removed: int = 0
    missing_prices_removed: int = 0
    non_positive_removed: int = 0
    stale_runs: dict[str, int] = field(default_factory=dict)
    tickers: list[str] = field(default_factory=list)
    first_date: str | None = None
    last_date: str | None = None
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return self.__dict__.copy()


def validate_prices(raw: pd.DataFrame, stale_run_threshold: int = 5) -> tuple[pd.DataFrame, ValidationReport]:
    """Clean a long-format price table and report what was changed.

    ``raw`` must have at least ``date``, ``ticker`` and ``adjusted_close``.
    Missing values are *dropped*, never forward-filled: a market holiday is
    different from a stale or delisted asset, so we refuse to invent prices.
    """
    missing_cols = [c for c in REQUIRED_COLUMNS if c not in raw.columns]
    if missing_cols:
        raise ValueError(f"price table is missing columns: {missing_cols}")

    rep = ValidationReport(rows_in=len(raw))
    df = raw.copy()
    df["ticker"] = df["ticker"].astype(str).str.strip().str.upper()
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None).dt.normalize()

    before = len(df)
    df = df.sort_values(["ticker", "date"]).drop_duplicates(["ticker", "date"], keep="last")
    rep.duplicates_removed = before - len(df)

    before = len(df)
    df = df[df["adjusted_close"].notna()]
    rep.missing_prices_removed = before - len(df)

    before = len(df)
    price_cols = [c for c in ["open", "high", "low", "close", "adjusted_close"] if c in df.columns]
    positive = (df[price_cols].fillna(1.0) > 0).all(axis=1)
    df = df[positive]
    rep.non_positive_removed = before - len(df)

    # Stale prices: long runs of an unchanged adjusted close usually mean a data problem.
    for t, g in df.groupby("ticker"):
        same = g["adjusted_close"].diff().eq(0)
        run = (same.groupby((~same).cumsum()).cumsum()).max()
        if pd.notna(run) and run >= stale_run_threshold:
            rep.stale_runs[t] = int(run)
            rep.warnings.append(f"{t}: {int(run)} consecutive unchanged closes")

    rep.rows_out = len(df)
    rep.tickers = sorted(df["ticker"].unique().tolist())
    if len(df):
        rep.first_date = df["date"].min().date().isoformat()
        rep.last_date = df["date"].max().date().isoformat()
    return df.reset_index(drop=True), rep


def to_price_matrix(long_df: pd.DataFrame, column: str = "adjusted_close") -> pd.DataFrame:
    """Pivot a long price table into a dates x tickers matrix."""
    m = long_df.pivot(index="date", columns="ticker", values=column).sort_index()
    m.index = pd.to_datetime(m.index)
    m.columns.name = None
    return m
