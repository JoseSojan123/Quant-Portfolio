# Development

## Setup

Python 3.11+ and Node 20+.

```bash
pip install -e ".[dev]"                      # engine + API + yfinance + pytest + ruff
cd frontend && npm install && cd ..
```

Two terminals:

```bash
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

The first backend start creates the SQLite schema, loads the universe and
generates about ten years of synthetic prices — roughly fifteen seconds, once.
Delete `backend/data/app.db` to start over.

`AUTO_SEED=false` turns the first-boot seeding off, for when you want to point
at a database that is already populated.

## Running things

```bash
pytest                                   # 77 tests
pytest backend/tests/test_quant_core.py  # one file
pytest -k optimizer -x                   # by name, stop on first failure
pytest --durations=10                    # find the slow ones

ruff check .                             # lint
ruff check --fix .                       # and fix what is mechanical

cd frontend
npx tsc --noEmit                         # typecheck
npx next lint                            # lint
npm test                                 # vitest
npm run build                            # production build
```

CI runs exactly these. A green local run is a green CI run, except for the
PostgreSQL job, which needs a server.

## Against PostgreSQL locally

```bash
docker run -d --name quant-pg -p 5432:5432 \
  -e POSTGRES_USER=quant -e POSTGRES_PASSWORD=quant -e POSTGRES_DB=quant \
  postgres:16-alpine

pip install -e ".[dev,postgres]"
export DATABASE_URL=postgresql://quant:quant@localhost:5432/quant
python database/seed/seed.py
cd backend && uvicorn app.main:app --reload
```

The models, queries and upserts are identical on both backends; the upsert is
dialect-aware. Worth doing once before deploying, because SQLite is forgiving
about types in ways Postgres is not.

## Live market data

```bash
pip install -e ".[dev,data]"
DATA_SOURCE=yahoo python jobs/update_market_data.py --source yahoo --full --verbose
```

`--full` refetches all history; without it the job refetches a short overlap
window so provider corrections land. Check what you got:

```bash
curl -s localhost:8000/meta/data-status | jq
```

## Conventions

### Python

- Type hints on anything public. `from __future__ import annotations` at the top
  of every module.
- Engine functions take and return pandas objects or plain dicts, never ORM
  models. If a function needs a `Session`, it belongs in `backend/app/services/`,
  not in `quant/`.
- Docstrings say *why* and state the convention chosen where more than one
  exists. "Turnover is Σ|target − current|, so a full switch is 200%" is worth a
  line; "returns the turnover" is not.
- Money and weights are `float`. Nothing in this project needs `Decimal`:
  weights are ratios and prices are already approximations.
- Line length 130. `ruff` enforces the rest.

### TypeScript

- `strict` is on, and `any` does not appear in the codebase. Response types live
  in `lib/types.ts` and mirror the API exactly.
- Pages are client components, because every one of them is interactive. Data
  comes from SWR, keyed on the serialized request body.
- Formatting goes through `lib/format.ts`. A raw `toFixed` in a component is a
  bug waiting to disagree with the next component.
- Tailwind utilities, with the repeated patterns extracted as component classes
  in `globals.css` (`.card`, `.input`, `.num`, `.label`, `.table-base`).

### Charts

The chart components enforce the rules so a page cannot break them: one y-axis
(never two), a fixed hue per entity so a filter cannot repaint a series, a
legend whenever there are two or more series, 2px lines and bars no thicker than
24px, a sequential blue ramp for magnitude, a diverging blue↔red scale with a
gray midpoint for correlation, and green/red reserved for financial direction
rather than used as categorical colours. The palette is validated for
colour-vision deficiency; adding a hue means re-validating it, not eyeballing it.

### Numbers on screen

Every figure a user could act on carries its provenance. In practice:

- a `HowCalculated` popover with the formula and its assumption;
- an `InputsNote` line stating the window, the estimators and the risk-free rate
  that produced the numbers on that page;
- a visible label when the data source is synthetic.

A new analytics page that omits these is incomplete, not merely unpolished.

## How to add things

### An asset

`quant/data/universe.py`, one entry in `ASSET_UNIVERSE`:

```python
{"ticker": "KO", "name": "Coca-Cola Company", "sector": "Consumer Staples", "asset_type": "Stock",
 "tags": ["defensive", "dividend"],
 "synthetic": {"beta": 0.6, "sector": 0.4, "rate": 0.2, "oil": 0.0,
               "idio": 0.12, "alpha": 0.02, "end": 62.0}},
```

Then `python jobs/update_market_data.py`. The `synthetic` block only drives the
offline generator: `beta` against the market factor, `sector` against its sector
factor, `rate` and `oil` against those factors, `idio` for annualized
idiosyncratic volatility, `alpha` as an annual drift, and `end` as the price the
series should finish near. With `DATA_SOURCE=yahoo` the block is ignored
entirely. Pick the numbers so the series is plausible, then compare the
generated statistics against what you know about the real asset before
committing.

### A stress scenario

`quant/stress/scenarios.py`, append to `PREDEFINED_SCENARIOS`:

```python
Scenario("credit_crunch", "Credit crunch",
         "Financials fall 30% and the broad market 15% as credit spreads widen.",
         "rules", sector_shocks={"Financials": -0.30}, market_shock=-0.15),
```

It appears in `GET /risk/scenarios` and on the stress page with no frontend
change. `kind="historical"` with `start` and `end` replays the actual moves over
that window instead.

### An optimization objective

1. Add the branch in `quant/optimization/optimizer.py` with its gradient.
2. Add the literal to `Objective` in `backend/app/schemas/analytics.py`.
3. Add the label to `OBJECTIVES` in `frontend/components/portfolio/settings-panel.tsx`.
4. Add a test asserting the result satisfies every constraint and that the
   objective actually improves on the equal-weight baseline for a case where it
   should.

### An analytics endpoint

Put the mathematics in `quant/`, with a test that does not involve HTTP. Add the
request model to `backend/app/schemas/analytics.py`, inheriting `PortfolioSpec`
and `AnalysisSettings` so it accepts the same envelope as every other analytics
call. Add the route to `backend/app/api/analytics.py`, reusing
`A.resolve`/`A.build_inputs` and returning `A.sanitize(...)`. Then the page, with
its types in `lib/types.ts`.

## Testing philosophy

The engine tests assert properties, not golden numbers, because a golden number
locks in whatever the implementation did on the day it was written:

- risk contributions sum to portfolio volatility;
- every optimizer result satisfies every constraint it was given;
- a tighter constraint never produces a better objective value;
- an infeasible constraint set raises a message naming the conflict;
- the backtest's estimation window ends strictly before the date it trades on;
- a user asking for another user's portfolio gets 404 on every route.

That last one is a test rather than a code review note because it is the kind of
thing a refactor breaks silently.

New tests go next to their subject: `test_quant_core.py` for returns and risk,
`test_quant_engines.py` for optimizer, simulation, stress and backtest,
`test_api.py` for routes, auth and isolation.

## Debugging

```bash
# What the API actually received and returned
cd backend && uvicorn app.main:app --reload --log-level debug

# Drive the engine directly, with no server
python - <<'PY'
import sys; sys.path.insert(0, ".")
from quant.data.synthetic import generate_synthetic_prices
from quant.data.validation import to_price_matrix, validate_prices
from quant.features.returns import simple_returns
from quant.optimization.estimators import estimate_covariance, estimate_expected_returns
from quant.optimization.optimizer import Constraints, optimize

clean, report = validate_prices(generate_synthetic_prices())
prices = to_price_matrix(clean)[["AAPL", "MSFT", "JPM", "XOM", "TLT"]]
rets = simple_returns(prices)
mu, cov = estimate_expected_returns(rets), estimate_covariance(rets)
res = optimize(mu, cov, "max_sharpe", Constraints(max_weight=0.4), 0.04, {})
print(res.weights, res.volatility, res.sharpe)
PY
```

`notebooks/` has the same thing with charts.

Common surprises:

- **Weights do not sum to 1** — you are looking at an infeasible constraint set
  that the optimizer reported and the caller swallowed. Check the 400 body.
- **A metric is `null`** — `sanitize` converted a `NaN`. Usually too few
  observations after alignment; check `inputs.observations`.
- **Prices look stale** — the price cache keys on the latest successful update.
  If a job wrote rows but failed at the end, the row is `failed` and the cache
  key did not move. Check `/meta/data-status`.
- **A write returns 403 "Cross-origin request blocked"** — the request carried
  the session cookie together with an `Origin` the server does not recognize.
  Add that origin to `CORS_ORIGINS`, or set `FRONTEND_URL`, which is appended
  to the allowed list automatically.
