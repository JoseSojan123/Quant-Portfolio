"""The asset universe the platform supports.

Each entry carries the metadata the rest of the engine needs: sector (for sector
caps and sector stress scenarios), asset type, currency and scenario tags.

The ``synthetic`` block parameterizes the deterministic demo-data generator
(``quant.data.synthetic``). It is only used when real market data has not been
downloaded; see ``jobs/update_market_data.py``.

synthetic parameters
  beta      sensitivity to the market factor
  sector    loading on the sector factor
  rate      loading on the interest-rate factor (positive = hurt by rising rates)
  oil       loading on the oil/energy factor
  idio      annualized idiosyncratic volatility
  alpha     annualized drift on top of the factor drift
  end       approximate price on the final date of the synthetic sample
"""

from __future__ import annotations

BENCHMARK = "SPY"

ASSET_UNIVERSE: list[dict] = [
    # --- Technology -------------------------------------------------------------
    {"ticker": "AAPL", "name": "Apple Inc.", "sector": "Technology", "asset_type": "Stock",
     "tags": ["mega_cap"], "synthetic": {"beta": 1.15, "sector": 0.55, "rate": 0.1, "oil": 0.0, "idio": 0.17, "alpha": 0.06, "end": 255.0}},
    {"ticker": "MSFT", "name": "Microsoft Corp.", "sector": "Technology", "asset_type": "Stock",
     "tags": ["mega_cap"], "synthetic": {"beta": 1.05, "sector": 0.55, "rate": 0.1, "oil": 0.0, "idio": 0.14, "alpha": 0.07, "end": 510.0}},
    {"ticker": "NVDA", "name": "NVIDIA Corp.", "sector": "Technology", "asset_type": "Stock",
     "tags": ["mega_cap", "semis"], "synthetic": {"beta": 1.65, "sector": 0.9, "rate": 0.2, "oil": 0.0, "idio": 0.33, "alpha": 0.27, "end": 180.0}},
    {"ticker": "AVGO", "name": "Broadcom Inc.", "sector": "Technology", "asset_type": "Stock",
     "tags": ["semis"], "synthetic": {"beta": 1.3, "sector": 0.8, "rate": 0.15, "oil": 0.0, "idio": 0.26, "alpha": 0.2, "end": 330.0}},
    {"ticker": "AMD", "name": "Advanced Micro Devices", "sector": "Technology", "asset_type": "Stock",
     "tags": ["semis"], "synthetic": {"beta": 1.6, "sector": 0.85, "rate": 0.2, "oil": 0.0, "idio": 0.36, "alpha": 0.08, "end": 165.0}},
    {"ticker": "ORCL", "name": "Oracle Corp.", "sector": "Technology", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 0.95, "sector": 0.45, "rate": 0.1, "oil": 0.0, "idio": 0.24, "alpha": 0.05, "end": 290.0}},
    {"ticker": "CRM", "name": "Salesforce Inc.", "sector": "Technology", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 1.15, "sector": 0.5, "rate": 0.2, "oil": 0.0, "idio": 0.25, "alpha": 0.0, "end": 245.0}},
    # --- Communication services / consumer -------------------------------------
    {"ticker": "GOOGL", "name": "Alphabet Inc. (Class A)", "sector": "Communication Services", "asset_type": "Stock",
     "tags": ["mega_cap"], "synthetic": {"beta": 1.1, "sector": 0.45, "rate": 0.1, "oil": 0.0, "idio": 0.2, "alpha": 0.06, "end": 245.0}},
    {"ticker": "META", "name": "Meta Platforms Inc.", "sector": "Communication Services", "asset_type": "Stock",
     "tags": ["mega_cap"], "synthetic": {"beta": 1.3, "sector": 0.6, "rate": 0.15, "oil": 0.0, "idio": 0.3, "alpha": 0.0, "end": 740.0}},
    {"ticker": "AMZN", "name": "Amazon.com Inc.", "sector": "Consumer Discretionary", "asset_type": "Stock",
     "tags": ["mega_cap"], "synthetic": {"beta": 1.2, "sector": 0.4, "rate": 0.15, "oil": 0.0, "idio": 0.22, "alpha": 0.02, "end": 225.0}},
    {"ticker": "TSLA", "name": "Tesla Inc.", "sector": "Consumer Discretionary", "asset_type": "Stock",
     "tags": ["mega_cap"], "synthetic": {"beta": 1.8, "sector": 0.6, "rate": 0.25, "oil": 0.0, "idio": 0.48, "alpha": 0.18, "end": 430.0}},
    {"ticker": "HD", "name": "Home Depot Inc.", "sector": "Consumer Discretionary", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 1.0, "sector": 0.35, "rate": 0.25, "oil": 0.0, "idio": 0.17, "alpha": 0.03, "end": 405.0}},
    {"ticker": "WMT", "name": "Walmart Inc.", "sector": "Consumer Staples", "asset_type": "Stock",
     "tags": ["defensive"], "synthetic": {"beta": 0.55, "sector": 0.4, "rate": 0.0, "oil": 0.0, "idio": 0.16, "alpha": 0.1, "end": 102.0}},
    {"ticker": "PG", "name": "Procter & Gamble Co.", "sector": "Consumer Staples", "asset_type": "Stock",
     "tags": ["defensive"], "synthetic": {"beta": 0.45, "sector": 0.55, "rate": 0.1, "oil": 0.0, "idio": 0.13, "alpha": 0.05, "end": 155.0}},
    {"ticker": "KO", "name": "Coca-Cola Co.", "sector": "Consumer Staples", "asset_type": "Stock",
     "tags": ["defensive"], "synthetic": {"beta": 0.5, "sector": 0.55, "rate": 0.1, "oil": 0.0, "idio": 0.12, "alpha": 0.05, "end": 69.0}},
    {"ticker": "PEP", "name": "PepsiCo Inc.", "sector": "Consumer Staples", "asset_type": "Stock",
     "tags": ["defensive"], "synthetic": {"beta": 0.5, "sector": 0.55, "rate": 0.1, "oil": 0.0, "idio": 0.13, "alpha": 0.03, "end": 145.0}},
    # --- Financials ---------------------------------------------------------------
    {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "sector": "Financials", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 1.05, "sector": 0.7, "rate": -0.25, "oil": 0.05, "idio": 0.17, "alpha": 0.09, "end": 305.0}},
    {"ticker": "BAC", "name": "Bank of America Corp.", "sector": "Financials", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 1.2, "sector": 0.8, "rate": -0.3, "oil": 0.05, "idio": 0.19, "alpha": 0.03, "end": 51.0}},
    {"ticker": "GS", "name": "Goldman Sachs Group", "sector": "Financials", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 1.25, "sector": 0.7, "rate": -0.2, "oil": 0.05, "idio": 0.2, "alpha": 0.04, "end": 780.0}},
    {"ticker": "V", "name": "Visa Inc.", "sector": "Financials", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 0.95, "sector": 0.35, "rate": 0.05, "oil": 0.0, "idio": 0.15, "alpha": 0.05, "end": 345.0}},
    {"ticker": "MA", "name": "Mastercard Inc.", "sector": "Financials", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 1.0, "sector": 0.35, "rate": 0.05, "oil": 0.0, "idio": 0.15, "alpha": 0.06, "end": 570.0}},
    # --- Energy ---------------------------------------------------------------
    {"ticker": "XOM", "name": "Exxon Mobil Corp.", "sector": "Energy", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 0.8, "sector": 0.4, "rate": -0.1, "oil": 0.85, "idio": 0.16, "alpha": 0.04, "end": 113.0}},
    {"ticker": "CVX", "name": "Chevron Corp.", "sector": "Energy", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 0.85, "sector": 0.4, "rate": -0.1, "oil": 0.85, "idio": 0.16, "alpha": 0.01, "end": 155.0}},
    {"ticker": "COP", "name": "ConocoPhillips", "sector": "Energy", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 0.95, "sector": 0.45, "rate": -0.1, "oil": 1.05, "idio": 0.2, "alpha": 0.02, "end": 95.0}},
    # --- Health care ---------------------------------------------------------------
    {"ticker": "JNJ", "name": "Johnson & Johnson", "sector": "Health Care", "asset_type": "Stock",
     "tags": ["defensive"], "synthetic": {"beta": 0.5, "sector": 0.5, "rate": 0.05, "oil": 0.0, "idio": 0.14, "alpha": 0.02, "end": 180.0}},
    {"ticker": "PFE", "name": "Pfizer Inc.", "sector": "Health Care", "asset_type": "Stock",
     "tags": ["defensive"], "synthetic": {"beta": 0.6, "sector": 0.55, "rate": 0.05, "oil": 0.0, "idio": 0.22, "alpha": -0.1, "end": 25.0}},
    {"ticker": "UNH", "name": "UnitedHealth Group", "sector": "Health Care", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 0.65, "sector": 0.5, "rate": 0.05, "oil": 0.0, "idio": 0.24, "alpha": -0.02, "end": 340.0}},
    {"ticker": "LLY", "name": "Eli Lilly & Co.", "sector": "Health Care", "asset_type": "Stock",
     "tags": [], "synthetic": {"beta": 0.55, "sector": 0.5, "rate": 0.05, "oil": 0.0, "idio": 0.25, "alpha": 0.18, "end": 800.0}},
    # --- Utilities & real estate (rate sensitive) -------------------------------
    {"ticker": "NEE", "name": "NextEra Energy Inc.", "sector": "Utilities", "asset_type": "Stock",
     "tags": ["rate_sensitive", "defensive"], "synthetic": {"beta": 0.6, "sector": 0.7, "rate": 0.6, "oil": 0.0, "idio": 0.19, "alpha": 0.01, "end": 75.0}},
    {"ticker": "DUK", "name": "Duke Energy Corp.", "sector": "Utilities", "asset_type": "Stock",
     "tags": ["rate_sensitive", "defensive"], "synthetic": {"beta": 0.45, "sector": 0.7, "rate": 0.5, "oil": 0.0, "idio": 0.13, "alpha": 0.03, "end": 123.0}},
    {"ticker": "AMT", "name": "American Tower Corp.", "sector": "Real Estate", "asset_type": "Stock",
     "tags": ["rate_sensitive"], "synthetic": {"beta": 0.75, "sector": 0.7, "rate": 0.7, "oil": 0.0, "idio": 0.19, "alpha": -0.02, "end": 205.0}},
    {"ticker": "PLD", "name": "Prologis Inc.", "sector": "Real Estate", "asset_type": "Stock",
     "tags": ["rate_sensitive"], "synthetic": {"beta": 0.95, "sector": 0.7, "rate": 0.6, "oil": 0.0, "idio": 0.18, "alpha": 0.0, "end": 115.0}},
    # --- ETFs -------------------------------------------------------------------
    {"ticker": "SPY", "name": "SPDR S&P 500 ETF Trust", "sector": "Broad Market", "asset_type": "ETF",
     "tags": ["benchmark"], "synthetic": {"beta": 1.0, "sector": 0.0, "rate": 0.0, "oil": 0.0, "idio": 0.0, "alpha": 0.0, "end": 665.0}},
    {"ticker": "QQQ", "name": "Invesco QQQ Trust (Nasdaq-100)", "sector": "Broad Market", "asset_type": "ETF",
     "tags": ["tech_heavy"], "synthetic": {"beta": 1.12, "sector_factor": "Technology", "sector": 0.45, "rate": 0.1, "oil": 0.0, "idio": 0.05, "alpha": 0.03, "end": 600.0}},
    {"ticker": "XLE", "name": "Energy Select Sector SPDR", "sector": "Energy", "asset_type": "ETF",
     "tags": [], "synthetic": {"beta": 0.85, "sector": 0.45, "rate": -0.1, "oil": 0.9, "idio": 0.06, "alpha": 0.01, "end": 89.0}},
    {"ticker": "VNQ", "name": "Vanguard Real Estate ETF", "sector": "Real Estate", "asset_type": "ETF",
     "tags": ["rate_sensitive"], "synthetic": {"beta": 0.85, "sector": 0.75, "rate": 0.65, "oil": 0.0, "idio": 0.05, "alpha": -0.02, "end": 91.0}},
    {"ticker": "TLT", "name": "iShares 20+ Year Treasury Bond ETF", "sector": "Fixed Income", "asset_type": "ETF",
     "tags": ["rate_sensitive", "long_duration"], "synthetic": {"beta": -0.1, "sector": 0.0, "rate": 1.0, "oil": 0.0, "idio": 0.03, "alpha": -0.01, "end": 89.0}},
    {"ticker": "IEF", "name": "iShares 7-10 Year Treasury Bond ETF", "sector": "Fixed Income", "asset_type": "ETF",
     "tags": ["intermediate_duration"], "synthetic": {"beta": -0.04, "sector": 0.0, "rate": 0.45, "oil": 0.0, "idio": 0.015, "alpha": 0.0, "end": 96.0}},
    {"ticker": "GLD", "name": "SPDR Gold Shares", "sector": "Commodities", "asset_type": "ETF",
     "tags": ["gold"], "synthetic": {"beta": 0.1, "sector": 0.0, "rate": 0.15, "oil": 0.1, "idio": 0.14, "alpha": 0.2, "end": 355.0}},
]

UNIVERSE_BY_TICKER: dict[str, dict] = {a["ticker"]: a for a in ASSET_UNIVERSE}

DEFAULT_DEMO_TICKERS = ["AAPL", "MSFT", "NVDA", "JPM", "XOM"]


def asset_metadata(tickers: list[str] | None = None) -> dict[str, dict]:
    """Return ``{ticker: {name, sector, asset_type, currency, tags}}`` for the universe."""
    out = {}
    for a in ASSET_UNIVERSE:
        if tickers is None or a["ticker"] in tickers:
            out[a["ticker"]] = {
                "name": a["name"],
                "sector": a["sector"],
                "asset_type": a["asset_type"],
                "currency": a.get("currency", "USD"),
                "tags": list(a.get("tags", [])),
            }
    return out
