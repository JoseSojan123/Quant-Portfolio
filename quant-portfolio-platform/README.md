# Quantitative Portfolio Construction & Risk Platform

You enter what you own — ticker, quantity, average cost. The platform values it
against stored market prices and then does the work a desk actually does with a
portfolio: measures where its risk sits, optimizes it under constraints you can
see, stresses it against scenarios, simulates its distribution of outcomes, and
tests the whole process on history without letting it peek at the future.

**The site does not hide the mathematics.** Every important number carries a
“How is this calculated?” explanation, every analytics page states the estimation
window and the estimators that produced its figures, and `/methodology` writes
out each formula with the assumption it makes about the world.

Current prices are never a field you fill in. You supply what you hold and what
you paid; prices come from the data pipeline. There is no brokerage integration
and nothing ever asks for brokerage credentials.

---

## Quick start

Two terminals, no Docker, no database server. For a step-by-step version with Windows commands and every optional key, see [RUN_LOCALLY.md](RUN_LOCALLY.md).

```bash
# 1. Backend  (Python 3.11+)
pip install -e ".[dev]"
cd backend && uvicorn app.main:app --reload --port 8000
```

On first boot it creates the SQLite schema, loads the 39-asset universe and
generates about ten years of price history. That takes roughly fifteen seconds
and happens once.

```bash
# 2. Frontend  (Node 20+)
cd frontend && npm install && npm run dev
```

Open <http://localhost:3000>. Click **Try it with a sample portfolio** for a
throwaway guest account, or create a real one — with no SMTP server configured,
the verification link is returned in the API response and shown in the UI.

API docs are at <http://localhost:8000/docs> (OpenAPI, generated from the
pydantic schemas).

### With Docker instead

```bash
cp .env.example .env            # edit JWT_SECRET if you expose this anywhere
docker compose up --build
```

That brings up PostgreSQL, the API on `:8000`, the web app on `:3000` and a
one-shot seed job.

---

## What it does

| Page | What you get |
|---|---|
| `/dashboard` | Value, cost basis, unrealized P&L, allocation, risk headlines, drawdown, and plain-language insights that link to the page that explains each one |
| `/portfolio` | Add, edit and delete holdings inline; allocation by asset, sector and type |
| `/optimize` | Minimum variance, maximum Sharpe, target return, risk parity and equal weight, with long-only, max-weight, minimum-holding, sector-cap, cash-floor and turnover constraints — plus a current-vs-optimized explanation and a trade preview |
| `/efficient-frontier` | The constrained frontier, random feasible portfolios, individual assets, the tangency portfolio and the capital market line |
| `/risk` | Risk contribution per holding, correlation matrix, concentration (HHI and effective N), historical and parametric VaR and Expected Shortfall, drawdown history, return distribution, per-asset statistics, market beta and alpha |
| `/stress-test` | Market, sector, rate and energy shocks, historical replays (COVID 2020, the 2022 bear market, April 2025), and custom shocks you define, each with per-holding loss attribution |
| `/monte-carlo` | Normal, Student-t or historical-bootstrap simulation with a percentile fan chart, terminal distribution, simulated VaR/ES and path drawdowns |
| `/rebalance` | Drift against a target, a threshold rule, turnover and cost estimates, and an exact share-level trade list |
| `/what-if` | Invest more, shock one holding, shock the market, trim a position, or switch to a target allocation — with risk before and after |
| `/backtest` | Walk-forward comparison of strategies with re-estimation at each rebalance, drifting weights, transaction costs, a benchmark, and the no-look-ahead checks displayed |
| `/methodology` | Every formula, its convention, and what it assumes |
| `/about` | Architecture, decisions, security posture and known limitations |

Plus the full account experience: sign up, email verification, sign in, forgot
and reset password, onboarding, profile, security (change password, sign out
everywhere, delete account) and settings for the modelling defaults.

---

## Architecture

```
Browser
  │
  ├── Next.js 15 (App Router, React 19, TypeScript, Tailwind, Recharts, SWR)
  │     └── rewrites /api/* → the backend, so the session cookie stays first-party
  │
  ├── FastAPI (pydantic v2 request validation, cookie JWT auth, rate limits)
  │     └── thin: validate → resolve portfolio → check ownership → call engine → serialize
  │
  ├── quant/  (NumPy, pandas, SciPy — no web framework imported)
  │     returns · risk metrics · estimators · SLSQP optimizer · Monte Carlo
  │     stress scenarios · rebalancing · walk-forward backtester
  │
  └── PostgreSQL or SQLite  ←  jobs/update_market_data.py (the only thing that
                               talks to a market-data provider)
```

```
quant/                  the engine; importable from the API, tests and notebooks
  data/                 universe, NYSE calendar, providers, validation, synthetic generator
  features/returns.py   alignment, simple/log returns, annualization, per-asset statistics
  risk/                 metrics, risk contribution, VaR/ES, drawdown, what-if
  optimization/         estimators (sample, Ledoit-Wolf, EWMA, Bayes-Stein, CAPM) and the optimizer
  simulation/           Monte Carlo
  stress/               predefined and custom scenarios
  rebalancing/          drift, turnover, trade lists
  backtest/             walk-forward engine
  factors/              market beta and factor attribution

backend/
  app/api/              one module per route group
  app/schemas/          request and response models
  app/services/         pipeline, market-data cache, analytics orchestration
  app/db/               SQLAlchemy 2 models and session
  app/core/             settings, security, rate limiting, email
  tests/                77 tests: engine, API, auth, isolation, integrity

frontend/
  app/                  (public) · (auth) · (app) route groups, 22 routes
  components/           ui primitives, charts, layout, portfolio forms
  lib/                  API client, formatters, auth context, types

jobs/                   scheduled data refresh and return recomputation
database/               explicit DDL and the seeder
docs/                   architecture, API, deployment, development, methodology
notebooks/              the engine driven directly, for exploration
```

The engine imports nothing from the web stack. That is what lets the same code
run in the API, in `pytest`, in a scheduled job and in a notebook, and it is why
the finance logic is testable without starting a server.

---

## Market data

The pipeline fetches daily prices, validates them, upserts them, recomputes
returns, and records the run in `data_updates`. The API reads from the database
and never calls a provider during a request, so a slow provider cannot make a
user-facing page hang.

```bash
python jobs/update_market_data.py --source yahoo     # live adjusted closes
python jobs/update_market_data.py --source synthetic # offline generator
python jobs/calculate_returns.py                     # rebuild returns only
```

Validation drops missing days rather than forward-filling them (a filled price
invents a flat day and understates volatility), drops non-positive prices,
de-duplicates on ticker and date, aligns assets on their common trading days,
and flags runs of identical closes as possibly stale.

**This deployment defaults to `DATA_SOURCE=synthetic.`** The generator is a
documented factor model — market factor, sector factors, rate and oil
sensitivities, Student-t daily noise, and real drawdown episodes pinned to their
historical dates — run from a fixed seed, so every figure is reproducible. It
exists because the hosting sandbox has no outbound access to a market-data
provider, and because a default that needs no API key means the project runs for
anyone who clones it. Set `DATA_SOURCE=yahoo` and the same pipeline, the same
validation and the same formulas run on real adjusted closes. The app labels its
data source in the top bar, on `/about`, on `/settings` and on `/methodology`, so
a synthetic number is never presented as a market fact.

---

## Testing

```bash
pytest                      # 77 tests: engine properties, API behaviour, auth, isolation
cd frontend && npm test     # formatter unit tests
cd frontend && npm run build && npx tsc --noEmit
```

The engine tests assert properties rather than golden numbers: risk
contributions sum to portfolio volatility, every optimizer result satisfies every
constraint it was given, an infeasible constraint set raises a message a human can
read, the backtest's estimation window ends strictly before the date it trades on,
and one user asking for another user's portfolio gets a 404 rather than a 403 —
so the API never confirms that someone else's data exists.

---

## Configuration

Every setting has a working default except `JWT_SECRET`, which is required in
production and generated once into `backend/data/.jwt_secret` in development.
See [`.env.example`](.env.example) for the full list with comments.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///backend/data/app.db` | PostgreSQL and Supabase URLs work unchanged; `postgres://` is rewritten |
| `JWT_SECRET` | generated in dev | **Required in production.** Changing it signs everyone out |
| `DATA_SOURCE` | `synthetic` | `synthetic` or `yahoo` |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | With no SMTP host, links are logged and surfaced in dev responses |
| `API_URL` | `http://localhost:8000` | Where the Next.js server proxies `/api/*` |
| `MAX_MC_CELLS` | `6000000` | Caps simulations × horizon so one request cannot exhaust memory |

---

## Security

- Passwords hashed with bcrypt. Session is a signed JWT in an httpOnly,
  SameSite cookie, `Secure` in production, carrying a `token_version` that is
  bumped on password change and on "sign out everywhere" — which invalidates
  every existing session without a session table.
- Verification and reset tokens are single-use, time-limited, and fingerprinted
  against the current password hash, so a reset link dies the moment the
  password changes.
- A cookie-authenticated write from an unrecognized `Origin` is rejected (CSRF,
  on top of the `SameSite` attribute), rate limits on auth and on the expensive
  analytics endpoints, security headers set on both tiers.
- Every query is scoped to the signed-in user. A request for someone else's
  portfolio returns 404, not 403, so the API never reveals that it exists.
- All input validated by pydantic at the edge; errors are logged with stack
  traces server-side and returned to the client as generic messages.
- No brokerage credentials, API keys or access tokens are stored — there is no
  field to enter them. Secrets come from the environment only; `.env` is
  gitignored and nothing secret is committed.

---

## Limitations, stated plainly

Expected returns are estimated from history and are the noisiest input in the
whole chain; the covariance matrix is assumed stable, and in a crisis
correlations converge towards one; volatility is not the same thing as risk;
taxes, market impact and spreads beyond a flat cost rate are out of scope; and a
backtest assumes you trade at the close on the rebalance date, which is better
than you will get.

This is an analysis and educational tool. It is not investment advice, and it
does not place trades.

---

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — layers, data flow, why the engine is framework-free
- [`docs/api.md`](docs/api.md) — every endpoint, with request and response shapes
- [`docs/methodology.md`](docs/methodology.md) — the formulas, conventions and assumptions
- [`docs/development.md`](docs/development.md) — local setup, tests, conventions, adding an asset or a scenario
- [`docs/deployment.md`](docs/deployment.md) — Docker, managed Postgres, the scheduled job, production checklist
- [`database/README.md`](database/README.md) — schema, migrations, seeding
- [`notebooks/`](notebooks/) — the engine driven directly

## License

MIT. See [LICENSE](LICENSE).
