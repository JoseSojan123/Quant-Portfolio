# API reference

The authoritative, always-current reference is the generated OpenAPI document:

- Swagger UI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>
- Schema: <http://localhost:8000/openapi.json>

This page is the orientation that a generated document cannot give: what the
groups are for, what the shared request body looks like, and what the error
behaviour means.

## Conventions

**Base URL.** The browser never calls the API host directly. Next.js rewrites
`/api/*` to `API_URL`, so from the browser every path below is prefixed with
`/api` and the session cookie stays first-party. Server to server, call the
backend directly with no prefix.

**Authentication.** A signed JWT in an httpOnly cookie (`qp_session`). There is
no `Authorization` header and no token in JavaScript. The token carries the
user id and a `token_version`; the version is incremented on password change and
on "sign out everywhere", which invalidates every previously issued token.

**CSRF.** A write (`POST`, `PUT`, `PATCH`, `DELETE`) that carries the session
cookie *and* an `Origin` header the server does not recognize is rejected with
403. Browsers always send `Origin` on a cross-site write, so this blocks the
attack; a request with no `Origin` at all — curl, or a server-to-server call —
is allowed, since a browser cannot produce one. This sits on top of the
`SameSite` cookie attribute rather than replacing it.

**Ownership.** Every query is scoped to the signed-in user. Asking for another
user's portfolio or run returns **404, not 403**, so the API never reveals that
the resource exists.

**Errors.** `{"detail": "..."}` with a message written for a person — for
example *"With 5 assets and a 15% cap, at most 75% can be invested"* rather than
a solver status code. Validation failures return 422 with the offending field
named in `detail` and the full list in `errors`; a well-formed request the
engine cannot satisfy (an infeasible constraint set, an unreachable target
return) also returns 422, with `detail` explaining why.
Unexpected failures return a generic 500; the stack trace is logged server-side
and never sent to the client.

**Rate limits.** Auth endpoints and the expensive analytics endpoints are
limited per IP (`AUTH_RATE_LIMIT_PER_MINUTE`, `HEAVY_RATE_LIMIT_PER_MINUTE`) and
return 429 when exceeded. The limiter is in-process, so it is per replica.

**JSON safety.** `NaN` and `±Infinity` never appear in a response; they are
converted to `null` before serialization, because they are not valid JSON and
break strict parsers.

---

## The shared analytics request body

Every analytics endpoint takes the same envelope. It describes *which* portfolio
to analyse and *how* to estimate its inputs, and each endpoint adds its own
fields on top.

```jsonc
{
  // Which portfolio — exactly one of these two forms.
  "portfolio_id": "uuid",            // a saved portfolio; weights from holdings at current prices
  // ...or an ad-hoc portfolio:
  "assets":  ["AAPL", "MSFT", "JPM"],
  "weights": { "AAPL": 0.4, "MSFT": 0.4, "JPM": 0.2 },   // optional; defaults to equal weight
  "capital": 100000,                                      // optional; defaults to 100,000

  // How to estimate. Anything omitted falls back to the user's saved preferences.
  "lookback_days": 756,                        // 60–2520 trading days
  "return_method": "historical",               // historical | bayes_stein | capm
  "cov_method": "sample",                      // sample | ledoit_wolf | ewma
  "risk_free_rate": 0.04                       // annual, as a decimal
}
```

Every analytics response carries an `inputs` object reporting exactly what was
used — window start and end, observation count, both estimators, the risk-free
rate and the annualization factor — so a screenshot of a number is always
traceable to the settings that produced it.

---

## Authentication — `/auth`

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | `{email, password, full_name, accept_terms}`. Password must be ≥10 characters with a letter and a digit; `accept_terms` must be `true`. Returns `requires_verification` when verification is on |
| POST | `/auth/verify-email` | Consumes a one-time token |
| POST | `/auth/resend-verification` | Rate limited; always reports success so it cannot be used to enumerate accounts |
| POST | `/auth/login` | Sets the session cookie. `remember` extends it to `REMEMBER_ME_DAYS` |
| POST | `/auth/logout` | Clears the cookie |
| POST | `/auth/logout-all` | Bumps `token_version`, invalidating every session everywhere |
| POST | `/auth/forgot-password` | Always reports success, whether or not the address exists |
| POST | `/auth/reset-password` | One-time token, fingerprinted against the current password hash, so the link dies when the password changes |
| POST | `/auth/change-password` | Requires the current password; signs out other sessions |
| GET | `/auth/me` | The signed-in user, or 401 |
| POST | `/auth/demo` | Creates a throwaway guest account with a sample portfolio. Expires after `GUEST_TTL_HOURS` |

With no `SMTP_HOST` configured, verification and reset emails are logged rather
than sent, and in non-production the link is returned as `dev_link` so local
development needs no mail server.

## Account — `/me`

| Method | Path | Notes |
|---|---|---|
| PATCH | `/me` | Update the display name |
| GET | `/me/preferences` | Modelling defaults: window, estimators, risk-free rate, confidence, cost rate, rebalance threshold, default objective, max weight, simulation defaults |
| PUT | `/me/preferences` | Replace them; validated against the same bounds the UI enforces |
| DELETE | `/me` | Delete the account. Portfolios, holdings and saved runs go with it by cascade |

## Portfolios — `/portfolios`

| Method | Path | Notes |
|---|---|---|
| GET | `/portfolios` | Summaries with value, cost and holding count |
| POST | `/portfolios` | Name, optional description, optional initial holdings |
| GET | `/portfolios/{id}` | Detail plus a full valuation |
| PATCH | `/portfolios/{id}` | Rename or re-describe |
| DELETE | `/portfolios/{id}` | Deletes its holdings too |
| POST | `/portfolios/{id}/default` | Marks it as the one the app opens on |
| POST | `/portfolios/{id}/holdings` | `{ticker, quantity, average_cost, notes?}`. Returns the whole refreshed portfolio detail, revalued |
| PATCH | `/portfolios/{id}/holdings/{holding_id}` | Change quantity, cost or notes |
| DELETE | `/portfolios/{id}/holdings/{holding_id}` | Remove a position. Returns the refreshed detail, like the other holding routes, so the client needs no second request |
| GET | `/portfolios/{id}/overview` | Everything the dashboard needs in one request: valuation, allocation, risk headlines, drawdown series and insights |

A holding carries **quantity and average cost only**. There is no current-price
field: the price comes from `prices_daily`. An unknown ticker is rejected with
the list of what is available.

## Analytics

| Method | Path | Adds to the shared body |
|---|---|---|
| POST | `/portfolio/optimize` | `objective`, the constraint block (`long_only`, `max_single_asset`, `min_weight`, `sector_caps`, `cash_floor`, `target_return`, `turnover_cap`), `save`, `name` |
| POST | `/portfolio/frontier` | `objective` to highlight, `n_points` (5–60), the same constraint block |
| POST | `/risk/metrics` | `confidence` (0.8–0.999), `horizon_days` (1–60) |
| GET | `/risk/scenarios` | — (the predefined scenario catalogue) |
| POST | `/risk/stress` | `scenario_ids` (omit for all), `custom: {name, shocks, sector_shocks}`, `save` |
| POST | `/simulation/monte-carlo` | `horizon_days`, `n_sims` (≤20,000), `method` (`normal`/`student_t`/`bootstrap`), `target_value`, `loss_threshold`, `seed` |
| POST | `/portfolio/rebalance` | A target as one of `target_weights`, `target_run_id` or `target_objective`; plus `cost_rate`, `threshold`, `whole_shares`, `force`, `save` |
| POST | `/backtest` | `strategies`, `frequency`, `estimation_window`, `cost_rate`, `max_single_asset`, `start_date` |
| POST | `/what-if` | `portfolio_id` and an `action`: `add_cash`, `asset_shock`, `market_shock`, `reduce_holding` or `rebalance_to` |

`/portfolio/optimize`, `/portfolio/frontier`, `/simulation/monte-carlo` and
`/backtest` sit behind the heavy rate limiter. Monte Carlo additionally refuses
a request where simulations × horizon exceeds `MAX_MC_CELLS`, with a message
suggesting a size that will work, so one request cannot exhaust memory.

### Optimization errors are readable

An infeasible constraint set returns 422 — the request is well formed but
cannot be satisfied — with an explanation rather than a solver code:

```json
{
  "detail": "Constraints are infeasible: weights cannot sum to 100%. With 5 assets and a 15% cap, at most 75% can be invested. Add assets, raise the max weight, relax sector caps or add a cash floor."
}
```

A target return above what the constraints allow reports the maximum that is
achievable, which is found with a linear program before the quadratic solve:

```json
{ "detail": "Target return 450.00% is not achievable under these constraints; the highest feasible expected return is 20.75%." }
```

## Saved analytics

| Method | Path | Notes |
|---|---|---|
| GET | `/runs` | Saved optimization runs, newest first. `portfolio_id` and `limit` filters |
| GET | `/runs/{run_id}` | One run with its full request and result, so a result is reproducible |
| DELETE | `/runs/{run_id}` | Remove it |
| GET | `/scenarios` | Scenarios you saved |
| POST | `/scenarios` | Save a stress or what-if configuration |
| DELETE | `/scenarios/{id}` | Remove it |
| GET | `/stress-history` | Past stress results, for comparison over time |

## Market data and metadata

| Method | Path | Notes |
|---|---|---|
| GET | `/assets` | The investable universe: ticker, name, sector, type, tags |
| GET | `/assets/{ticker}/history` | Adjusted closes for one asset, for a sparkline or a chart |
| GET | `/meta/data-status` | Source, whether it is synthetic, coverage dates, asset count, last refresh and the last job's status |
| GET | `/meta/app` | Version, environment, repository, data source |
| GET | `/health` | Liveness, for a container health check |

`/health`, `/meta/*` and `/assets` need no session; everything else does.

---

## Example: a full round trip

```bash
# 1. A throwaway account with a sample portfolio.
curl -s -c jar -X POST localhost:8000/auth/demo | jq .user.email

# 2. Its portfolio.
PID=$(curl -s -b jar localhost:8000/portfolios | jq -r '.[0].id')

# 3. Where the risk sits.
curl -s -b jar -H 'Origin: http://localhost:3000' \
     -H 'Content-Type: application/json' \
     -d "{\"portfolio_id\":\"$PID\"}" \
     localhost:8000/risk/metrics | jq '.metrics.volatility, .risk_contribution[0]'

# 4. Minimum variance under a 30% cap, and what it would cost to get there.
curl -s -b jar -H 'Origin: http://localhost:3000' \
     -H 'Content-Type: application/json' \
     -d "{\"portfolio_id\":\"$PID\",\"objective\":\"min_variance\",\"max_single_asset\":0.3}" \
     localhost:8000/portfolio/optimize | jq '.optimized.volatility, .explanation'
```

The `Origin` header here mirrors what a browser would send. Omitting it from
curl also works — the check only rejects an origin it does not recognize — but
sending it exercises the same path the app does.
