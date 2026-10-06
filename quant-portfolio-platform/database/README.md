# Database

Fourteen tables in three groups: reference and market data, user data, and saved
analytics. The ORM definitions in `backend/app/db/models.py` are the source of
truth; everything in this directory is generated from them or built on them.

```
database/
  migrations/001_initial_schema.sql   explicit DDL, regenerate from the models
  seed/seed.py                        create tables, load assets and prices, optional demo user
```

## Which database

The app runs on SQLite or PostgreSQL with the same models and the same queries.
`DATABASE_URL` decides:

```bash
DATABASE_URL=sqlite:///backend/data/app.db                     # default, zero setup
DATABASE_URL=postgresql://user:pass@localhost:5432/quant       # local Postgres
DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres   # Supabase
```

A `postgres://` prefix is rewritten to `postgresql://` on load, because several
hosting providers still hand out the older form that SQLAlchemy 2 rejects.

Upserts are dialect-aware: `ON CONFLICT ... DO UPDATE` on both backends, so a
re-run of the price job corrects existing rows instead of failing.

## Creating the schema

The web process calls `Base.metadata.create_all()` at startup, so a fresh
database needs no manual step. To provision one ahead of time, or to let the
application connect with a role that has no DDL rights:

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
```

The file is idempotent. Regenerate it after changing a model rather than editing
it by hand:

```bash
python - <<'PY'
import sys; sys.path[:0] = [".", "backend"]
from sqlalchemy.schema import CreateTable, CreateIndex
from sqlalchemy.dialects import postgresql
from app.db.models import Base
d = postgresql.dialect()
for t in Base.metadata.sorted_tables:
    print(str(CreateTable(t, if_not_exists=True).compile(dialect=d)).strip() + ";")
    for ix in sorted(t.indexes, key=lambda i: i.name):
        print(str(CreateIndex(ix, if_not_exists=True).compile(dialect=d)).strip() + ";")
PY
```

This project has one schema version, so it carries plain SQL rather than a
migration tool. Introducing a second version is the point at which to add
Alembic (`alembic init database/alembic`, `target_metadata = Base.metadata`) and
convert this file into the baseline revision.

## Seeding

```bash
python database/seed/seed.py                   # assets + prices from DATA_SOURCE
python database/seed/seed.py --source yahoo    # assets + live adjusted closes
python database/seed/seed.py --demo-user       # also demo@example.com / DemoPassword123
python database/seed/seed.py --force-prices    # refetch even if prices exist
```

The demo user is refused when `APP_ENV=production`: a published deployment with a
known password is a vulnerability. The signed-in app offers a throwaway guest
account instead, through the "Try it with a sample portfolio" button.

## What is stored, and what is not

| Group | Tables |
|---|---|
| Market data | `assets`, `prices_daily`, `returns_daily`, `data_updates` |
| Users | `users`, `portfolios`, `portfolio_holdings` |
| Saved analytics | `optimization_runs`, `portfolio_weights`, `risk_metrics`, `rebalance_runs`, `rebalance_items`, `stress_results`, `saved_scenarios` |

Holdings hold **quantity and average cost only**. The current price is never a
user-supplied field: it comes from `prices_daily`, which is written by the data
job. Passwords are stored as bcrypt hashes. No brokerage credential, API key or
access token is stored anywhere, because nothing in the app ever asks for one.

`users.token_version` is incremented on password change and on "sign out
everywhere", which invalidates every JWT issued before that moment without
keeping a session table.

## Retention

`data_updates` grows by one row per job run and is worth pruning on a long-lived
deployment:

```sql
DELETE FROM data_updates WHERE started_at < now() - interval '90 days';
```

Guest accounts expire after `GUEST_TTL_HOURS` and are removed with their
portfolios by the cascade on `users.id`.
