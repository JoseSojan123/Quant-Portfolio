# Deployment

Three pieces to place: the Next.js app, the FastAPI service, and a PostgreSQL
database — plus one scheduled job that refreshes prices.

## The shape that works

```
                        ┌───────────────────────────┐
   users  ──── HTTPS ──▶│ Next.js  (Vercel, Fly,    │
                        │ Render, a container)      │
                        │   /api/* ──▶ API_URL      │
                        └───────────┬───────────────┘
                                    │ server-side, private network if possible
                        ┌───────────▼───────────────┐
                        │ FastAPI  (Fly, Render,    │
                        │ Railway, Cloud Run, ECS)  │
                        └───────────┬───────────────┘
                                    │
                        ┌───────────▼───────────────┐      ┌──────────────────┐
                        │ PostgreSQL (Supabase,     │◀─────│ scheduled job    │
                        │ Neon, RDS, managed)       │      │ (GitHub Actions, │
                        └───────────────────────────┘      │ cron, a worker)  │
                                                           └──────────────────┘
```

The browser only ever talks to the Next.js origin. `/api/*` is rewritten
server-side to `API_URL`, which keeps the session cookie first-party, means no
CORS preflight on the hot path, and lets the API live on a private network with
no public ingress at all.

## Production checklist

Work through this before the first real user.

- [ ] **`JWT_SECRET` set to 48+ random bytes.** Required: the app refuses to
      start in production without it. `python -c "import secrets;print(secrets.token_urlsafe(48))"`.
      Changing it signs everyone out, so store it where you will not lose it.
- [ ] **`APP_ENV=production`.** This turns on `Secure` cookies, turns off the
      development verify/reset links in API responses, and makes the missing-secret
      check fatal.
- [ ] **`DATABASE_URL` points at PostgreSQL** with TLS. Run the app with a role
      that owns its own schema; if you want it to have no DDL rights, apply
      `database/migrations/001_initial_schema.sql` first.
- [ ] **`FRONTEND_URL` and `CORS_ORIGINS`** name your real origins and nothing
      else. `FRONTEND_URL` is appended to the allowed list automatically.
- [ ] **`API_URL`** on the web process points at the API, internal address if
      you have one.
- [ ] **SMTP configured** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
      `SMTP_PASSWORD`, `SMTP_FROM`), or set `REQUIRE_EMAIL_VERIFICATION=false`
      and accept that addresses are unverified. With neither, users cannot
      verify and cannot reset a password.
- [ ] **`DATA_SOURCE=yahoo`** and the refresh job scheduled, unless you
      intend to run on synthetic data — in which case leave the label on, which
      the app does by itself.
- [ ] **A real database backup.** The managed providers all do this; confirm the
      retention rather than assuming it.
- [ ] **Secrets injected as environment variables**, never baked into an image
      and never committed. `.env` is gitignored.
- [ ] **TLS terminated** in front of both services.
- [ ] **A shared rate limiter at the edge** if you run more than one API
      replica. The built-in limiter is in-process, so N replicas means N times
      the limit.
- [ ] **`/health` wired to the platform's health check** on the API.

## Docker Compose

```bash
cp .env.example .env
# Set JWT_SECRET and POSTGRES_PASSWORD to real values.
docker compose up --build -d
docker compose logs -f api
```

That starts PostgreSQL, a one-shot seed job, the API on `:8000` and the web app
on `:3000`. The seed job runs to completion before the API starts, so the first
request never lands on an empty database.

To enable the in-stack refresh loop (a simple sleep loop; an external scheduler
is better in production):

```bash
DATA_SOURCE=yahoo docker compose --profile jobs up -d refresh
```

Images build independently if you deploy them separately:

```bash
docker build -f backend/Dockerfile -t quant-api .          # context: repo root
docker build -f frontend/Dockerfile -t quant-web ./frontend # context: frontend/
```

The API image needs the repository root as its build context, because the
service imports the `quant` package that lives beside it.

## Platform notes

### Vercel for the frontend

Set the root directory to `frontend` and add `API_URL` as an environment
variable pointing at the API. The rewrite in `next.config.mjs` does the rest; no
`NEXT_PUBLIC_*` variable is needed, and no API URL is ever exposed to the
browser.

### Fly, Render, Railway or Cloud Run for the API

Build from `backend/Dockerfile` with the repository root as context. The
container listens on `8000` and exposes `/health`. Give it the environment from
the checklist above. One worker per container; scale with replicas.

### Supabase for PostgreSQL

Use the connection string from the project's database settings. A `postgres://`
prefix is rewritten to `postgresql://` on load, so paste it as given. Prefer the
connection pooler for a serverless or autoscaling API; use the direct connection
for the migration and seed steps.

This project implements its own authentication rather than using Supabase Auth,
so only the database is used. If you would rather delegate identity, replace
`backend/app/api/auth.py` and the `get_current_user` dependency: nothing in
`quant/` or in the analytics routes depends on how a user was authenticated.

## First deploy

```bash
# 1. Schema (optional — the app creates it on first boot).
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql

# 2. Assets and price history.
DATA_SOURCE=yahoo python database/seed/seed.py --source yahoo

# 3. Confirm.
curl -s https://api.example.com/health
curl -s https://api.example.com/meta/data-status | jq
```

`data-status` is the one to read: it reports the source, whether it is
synthetic, the coverage dates, the asset count and the last job's status. If
`last_date` is stale, the refresh job is not running.

## The scheduled refresh

```cron
30 22 * * 1-5  cd /app && DATA_SOURCE=yahoo python jobs/update_market_data.py >> /var/log/qpp-data.log 2>&1
```

After the US close on weekdays. The committed workflow
`.github/workflows/refresh-market-data.yml` does the same thing from GitHub
Actions; it needs `DATABASE_URL` and `JWT_SECRET` as repository secrets and the
repository variable `ENABLE_DATA_REFRESH=true`, so a fork does not start running
a nightly job by accident.

Every run writes a row to `data_updates` whether it succeeds or fails, and the
job exits non-zero on failure, so a scheduler can alert on it. The web process
notices new data by itself: its price cache is keyed on the id of the latest
successful update and the price row count, so no restart is needed.

## Operating it

**Monitor** `/health` for liveness and `/meta/data-status` for freshness — a
`last_date` more than a few days old during a trading week means the job has
stopped. The API sets `X-Response-Time-ms` on every response.

**Logs** go to stdout as single lines. Errors are logged with a stack trace
server-side and returned to the client as a generic message, so logs are the
only place a trace exists.

**Prune** `data_updates` on a long-lived deployment:

```sql
DELETE FROM data_updates WHERE started_at < now() - interval '90 days';
```

**Rotating `JWT_SECRET`** signs everyone out. That is the intended behaviour and
the correct response to a suspected leak.

**Guest accounts** expire after `GUEST_TTL_HOURS` and are removed with their
portfolios by the cascade on `users.id`.

## Cost

The database dominates. The app itself is small: a 39-asset universe is about
80,000 price rows and a few megabytes, the API is idle between requests, and the
frontend is static except for its API proxy. A hobby-tier managed Postgres, a
small API container and a free frontend tier are enough for a portfolio project
with real users on it.
