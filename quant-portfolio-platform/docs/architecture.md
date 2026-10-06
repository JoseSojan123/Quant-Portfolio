# Architecture

```
                         ┌──────────────────────────────────────────┐
  Browser  ───────────▶  │  Next.js 15 (App Router, React 19, TS)   │
                         │  · renders pages and charts              │
                         │  · rewrites /api/* → the API host        │
                         └──────────────────┬───────────────────────┘
                                            │  JSON over HTTPS, session cookie
                         ┌──────────────────▼───────────────────────┐
                         │  FastAPI                                 │
                         │  · validate (pydantic v2)                │
                         │  · authenticate (cookie JWT)             │
                         │  · authorize (owner-scoped queries)      │
                         │  · orchestrate, serialize                │
                         └──────────────────┬───────────────────────┘
                                            │  plain Python calls
                         ┌──────────────────▼───────────────────────┐
                         │  quant/  (NumPy · pandas · SciPy)        │
                         │  returns · risk · estimators · optimizer │
                         │  simulation · stress · rebalance · backtest│
                         └──────────────────┬───────────────────────┘
                                            │  SQLAlchemy 2
                         ┌──────────────────▼───────────────────────┐
                         │  PostgreSQL / SQLite                     │
                         └──────────────────▲───────────────────────┘
                                            │  the only process that
                         ┌──────────────────┴───────────────────────┐
                         │  jobs/update_market_data.py              │
                         │  talks to a market-data provider         │
                         └──────────────────────────────────────────┘
```

## The one rule that shapes everything

**The engine imports nothing from the web stack.** `quant/` depends on NumPy,
pandas and SciPy and on nothing else. The consequences are the point:

- The finance logic is testable without starting a server, which is why the
  engine tests run in seconds and assert mathematical properties rather than
  HTTP responses.
- The same code runs in the API, in `pytest`, in a scheduled job and in a
  notebook, so a result reproduced in a notebook is the result the app shows.
- The API stays thin enough to read in one sitting: validate, resolve which
  portfolio, check ownership, call the engine, serialize.

The corollary is that the engine knows nothing about users, requests or the
database. It takes DataFrames and returns dictionaries.

## Request flow, concretely

A click on "Optimize" with a 30% weight cap:

1. **Browser** → `POST /api/portfolio/optimize` with the portfolio id, the
   objective and the constraint block. SWR keys the request on the serialized
   body, so identical settings are served from cache and a changed setting
   refetches automatically.
2. **Next.js** rewrites `/api/*` to `API_URL` and forwards the cookie. Because
   the request is same-origin from the browser's point of view, the session
   cookie is first-party and no token ever exists in JavaScript.
3. **FastAPI** validates the body against `OptimizeRequest`. Out-of-range
   numbers and unknown objectives are rejected here, before any computation.
4. `get_current_user` decodes the JWT, loads the user, and checks the token's
   `token_version` against the stored one — which is how "sign out everywhere"
   works without a session table.
5. `analytics.resolve` turns the request into a concrete portfolio: either a
   saved one (ownership-checked; a miss and a non-owned row both 404) or an
   ad-hoc list of assets and weights.
6. `market_data.store` returns a cached price matrix. The cache key is the id of
   the latest successful `data_updates` row plus the price row count, so the
   web process picks up a refresh on its own without a restart and without
   re-reading the whole table on every request.
7. `analytics.build_inputs` estimates μ and Σ over the requested window with the
   requested estimators, and records exactly what it used in an `inputs` block.
8. `quant.optimization.optimize` solves the constrained problem with SLSQP and
   analytic gradients, after a feasibility check that can explain in words why
   an impossible constraint set is impossible.
9. The route computes current-vs-optimized metrics, risk contributions, the
   weight changes and a plain-language explanation, runs everything through
   `sanitize` (so no `NaN` or `Infinity` reaches the JSON), and returns it.
10. **Browser** renders the comparison, the explanation, the weight-change bars,
    the risk-share comparison and a trade preview.

Nothing in that path calls a market-data provider. A provider outage degrades
the freshness of the data, never the availability of the app.

## Layers and what belongs in each

### `quant/` — the engine

| Module | Responsibility |
|---|---|
| `data/universe.py` | The 39-asset investable universe with sector, type and tags; the benchmark |
| `data/calendar.py` | NYSE trading days and holidays, including Juneteenth from 2022 and special closures |
| `data/providers.py` | `fetch_prices(source, …)` — yfinance or the synthetic generator |
| `data/synthetic.py` | The deterministic offline price generator |
| `data/validation.py` | Normalize, de-duplicate, drop bad rows, flag stale series, build the price matrix |
| `features/returns.py` | Alignment, simple and log returns, annualization, per-asset statistics |
| `risk/metrics.py` | Volatility, Sharpe, Sortino, risk contribution, concentration, drawdown, VaR, ES, beta, alpha, tracking error |
| `risk/what_if.py` | Apply a hypothetical change and re-measure |
| `optimization/estimators.py` | Sample / Ledoit-Wolf / EWMA covariance; historical / Bayes-Stein / CAPM returns |
| `optimization/optimizer.py` | Constraints, feasibility, the five objectives, the efficient frontier |
| `simulation/monte_carlo.py` | Normal, Student-t and bootstrap paths; percentile bands; chunked to bound memory |
| `stress/scenarios.py` | Predefined and custom scenarios, applied to weights with per-asset attribution |
| `rebalancing/rebalance.py` | Drift, threshold rule, turnover, costs, share-level trades |
| `backtest/walk_forward.py` | The walk-forward engine and its integrity assertions |
| `factors/market.py` | Per-asset betas and factor attribution |

### `backend/app/` — the HTTP layer

| Package | Responsibility |
|---|---|
| `api/` | One module per route group; no finance logic |
| `schemas/` | Request and response models. `PortfolioSpec` and `AnalysisSettings` are shared by every analytics request |
| `services/pipeline.py` | Asset sync, price upsert, return recomputation, the audited `run_update`, first-boot seeding |
| `services/market_data.py` | The version-keyed in-memory price matrix |
| `services/analytics.py` | The orchestration the routes share: preferences, ownership, valuation, input building, metrics, narration |
| `db/` | SQLAlchemy 2 models and the session factory |
| `core/` | Settings, password hashing and JWTs, rate limiting, email |

`services/analytics.py` is where the API's own logic lives — resolving a request
into a portfolio, applying user preferences as defaults, and assembling a
response. Keeping it out of the route modules is what keeps nine analytics
endpoints from drifting apart.

### `frontend/` — presentation

| Directory | Responsibility |
|---|---|
| `app/(public)/` | `/methodology` and `/about`, readable without an account |
| `app/(auth)/` | Sign in, sign up, verify, forgot and reset password |
| `app/(app)/` | Everything behind a session, inside the application shell |
| `components/ui/` | Primitives, including the `HowCalculated` popover that every page uses |
| `components/charts/` | One component per chart form, over a single validated palette |
| `components/layout/` | Navigation, the shell, page headers and the provenance line |
| `components/portfolio/` | The holding form, asset pickers, and the shared estimation and constraint controls |
| `lib/` | API client, formatters, auth context, active-portfolio context, response types |

The estimation and constraint controls are one component used by five pages.
That is deliberate: the same control producing the same request field everywhere
is what makes the numbers comparable between pages.

## Data pipeline

```
provider ──▶ validate ──▶ upsert prices ──▶ recompute returns ──▶ log the run
             │                                                    │
             └─ drop missing days (never forward-fill)             └─ data_updates row:
                drop non-positive prices                              status, rows, date range,
                de-duplicate on (ticker, date)                        validation report
                align on common trading days
                flag runs of identical closes
```

Forward-filling is the tempting shortcut and the one this pipeline refuses: a
filled price invents a zero-return day, which drags measured volatility down and
makes a portfolio look safer than it is.

## Caching

| What | Where | Invalidation |
|---|---|---|
| Price matrix | API process memory | Keyed on the latest successful update id and the price row count |
| Analytics responses | Browser, via SWR | Keyed on the serialized request body; a changed setting is a new key |
| Settings | `lru_cache` on `get_settings()` | Process lifetime |

There is no server-side response cache. Analytics are cheap enough (tens of
milliseconds for a typical portfolio) that caching them would add staleness for
no real gain, and the one genuinely expensive call — the backtest — is the one a
user expects to wait for.

## Scaling

The in-process rate limiter and the price cache are per process, so scale with
replicas rather than `--workers`, and put a shared limiter at the edge if you
need a global limit. The database is the only shared state; the API keeps no
session state, so replicas need no coordination.

The two bounded resources are deliberate: Monte Carlo is capped at
`MAX_MC_CELLS` (simulations × horizon) and draws in chunks so a request cannot
allocate an unbounded array, and the universe is small enough that a covariance
matrix stays well under a megabyte.
