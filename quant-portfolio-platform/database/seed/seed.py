#!/usr/bin/env python3
"""Create the tables, load the asset universe, load prices, and optionally add a demo user.

A fresh checkout needs three things before the app is interesting: the asset
rows, a price history, and something to look at. The API does the first two
itself on startup (``ensure_seeded``); this script does all three on demand, so
a new database can be prepared before the web process ever runs.

    python database/seed/seed.py                      # assets + synthetic prices
    python database/seed/seed.py --source yahoo       # assets + live prices
    python database/seed/seed.py --demo-user          # also create demo@example.com

The demo user is a convenience for local development and is refused when
APP_ENV=production, because a known password in a public deployment is a
vulnerability, not a feature.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]

from sqlalchemy import func, select  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.models import Base, Holding, Portfolio, PriceDaily, User  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.services.pipeline import run_update, sync_assets  # noqa: E402
from quant.data.providers import PROVIDERS  # noqa: E402

log = logging.getLogger("database.seed")

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "DemoPassword123"
DEMO_HOLDINGS = [
    ("AAPL", 120, 142.50),
    ("MSFT", 80, 268.00),
    ("NVDA", 60, 310.00),
    ("JPM", 90, 128.40),
    ("XOM", 150, 96.20),
    ("SPY", 40, 398.00),
    ("TLT", 100, 101.75),
]


def seed_demo_user(session) -> None:
    settings = get_settings()
    if settings.is_production:
        log.error("refusing to create a demo user with a known password in production")
        return
    existing = session.scalar(select(User).where(User.email == DEMO_EMAIL))
    if existing:
        log.info("demo user already exists (%s)", DEMO_EMAIL)
        return

    user = User(email=DEMO_EMAIL, full_name="Demo User", password_hash=hash_password(DEMO_PASSWORD),
                email_verified=True)
    session.add(user)
    session.flush()
    portfolio = Portfolio(owner_id=user.id, name="Balanced growth",
                          description="Seven positions across technology, financials, energy and bonds.")
    session.add(portfolio)
    session.flush()
    for ticker, qty, cost in DEMO_HOLDINGS:
        session.add(Holding(portfolio_id=portfolio.id, ticker=ticker, quantity=qty, average_cost=cost))
    user.default_portfolio_id = portfolio.id
    session.commit()
    log.info("created %s / %s with %s holdings", DEMO_EMAIL, DEMO_PASSWORD, len(DEMO_HOLDINGS))


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=PROVIDERS, default=settings.data_source)
    parser.add_argument("--demo-user", action="store_true", help="create demo@example.com with a sample portfolio")
    parser.add_argument("--force-prices", action="store_true", help="refetch prices even if some are already stored")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s %(message)s")
    log.info("database: %s", settings.database_url.split("@")[-1])

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        ids = sync_assets(session)
        session.commit()
        log.info("%s assets in the universe", len(ids))

        have = session.scalar(select(func.count()).select_from(PriceDaily)) or 0
        if have and not args.force_prices:
            log.info("%s price rows already stored; use --force-prices to refetch", have)
        else:
            upd = run_update(session, source=args.source)
            log.info("price load %s: %s", upd.status, upd.message)
            if upd.status != "success":
                return 1

        if args.demo_user:
            seed_demo_user(session)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
