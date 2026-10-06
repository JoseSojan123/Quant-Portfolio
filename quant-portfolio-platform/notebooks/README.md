# Notebooks

The engine driven directly — the same code the API calls, with no web server and
no database in the loop. That is what keeping `quant/` free of framework imports
buys: a result reproduced here is the result the app shows.

| Notebook | What it covers |
|---|---|
| `01_portfolio_analysis.ipynb` | Prices and validation, returns and per-asset statistics, portfolio risk, risk contribution, correlation, the five objectives, the constrained efficient frontier, and how much the choice of estimator moves the answer |
| `02_simulation_and_backtest.ipynb` | Monte Carlo under three distributions, every predefined stress scenario, a walk-forward backtest with its no-look-ahead check verified rather than asserted, and a sensitivity grid over frequency and window |

## Running them

```bash
pip install -e ".[dev]" jupyter matplotlib
jupyter lab notebooks/
```

Both notebooks default to `SOURCE = "synthetic"`, so they need no network and
produce the same numbers every time. Set `SOURCE = "yahoo"` for real adjusted
closes (`pip install yfinance` first).

Outputs are not committed, so the diffs stay readable. Clear them before
committing a change:

```bash
jupyter nbconvert --clear-output --inplace notebooks/*.ipynb
```

## The two cells worth reading closely

**The estimator grid** at the end of notebook 1 runs max-Sharpe nine times over
the same data, changing only the expected-return and covariance estimators. The
spread across those nine rows is estimation error, not insight — and it is the
reason the app states the window and both estimators next to every number
instead of presenting one answer as the answer.

**The sensitivity grid** at the end of notebook 2 reruns the backtest across
three rebalance frequencies and three estimation windows. If the winning
strategy changes from row to row, the backtest is measuring noise. Equal weight
holding up across most of the grid is the usual and honest outcome.
