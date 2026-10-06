"""Quantitative engine for the Quantitative Portfolio Construction & Risk Platform.

Everything in this package is framework-free: pure functions over NumPy arrays and
pandas objects. The FastAPI backend, the batch jobs, the tests and the notebooks all
import from here, so the mathematics is written exactly once.

Conventions used across the package
-----------------------------------
* Returns are **simple daily returns** unless a function says otherwise.
* "Annualized" means 252 trading days per year (``TRADING_DAYS``).
* Expected returns are annualized arithmetic means; volatilities are annualized
  standard deviations (daily std x sqrt(252)).
* Weights are fractions that sum to 1 for a fully invested portfolio.
* Losses (VaR, Expected Shortfall) are reported as **positive** numbers.
"""

TRADING_DAYS = 252

__all__ = ["TRADING_DAYS"]
