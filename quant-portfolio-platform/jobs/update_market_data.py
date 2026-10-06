#!/usr/bin/env python3
"""Fetch, validate and store daily prices, then recompute daily returns.

This is the only process that talks to a market-data provider. The API never
does: it reads prices from the database, so a slow or broken provider can never
make a user-facing request hang.

Run it on a schedule after the US close, for example at 22:30 UTC on weekdays::

    30 22 * * 1-5  cd /app && python jobs/update_market_data.py --source yahoo

Every run writes one row to ``data_updates`` with its status, the number of rows
upserted, the date range now held and the validation report, so the app can show
on its About and Settings pages when the data was last refreshed and whether the
last attempt worked.

Exit code 0 on success, 1 on failure, so a scheduler can alert on it.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]

from app.core.config import get_settings  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.services.market_data import store  # noqa: E402
from app.services.pipeline import run_update  # noqa: E402
from quant.data.calendar import last_completed_trading_day  # noqa: E402
from quant.data.providers import PROVIDERS  # noqa: E402

log = logging.getLogger("jobs.update_market_data")


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=PROVIDERS, default=settings.data_source,
                        help="where to fetch prices from (default: the DATA_SOURCE setting)")
    parser.add_argument("--tickers", help="comma-separated subset; default is the whole universe")
    parser.add_argument("--start", help="first date to fetch, YYYY-MM-DD (default: incremental)")
    parser.add_argument("--end", help="last date to fetch, YYYY-MM-DD (default: last completed trading day)")
    parser.add_argument("--full", action="store_true", help="ignore the incremental window and refetch all history")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(name)s %(message)s")

    tickers = [t.strip().upper() for t in args.tickers.split(",")] if args.tickers else None
    end = args.end or last_completed_trading_day().isoformat()
    start = args.start or ("2015-01-01" if args.full else None)

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        log.info("Updating market data from %s (end %s)", args.source, end)
        upd = run_update(session, source=args.source, tickers=tickers, start=start, end=end)
        log.info("Status %s: %s", upd.status, upd.message)
        if upd.report:
            r = upd.report
            for key in ("dropped_missing", "dropped_nonpositive", "duplicate_rows"):
                if r.get(key):
                    log.warning("validation: %s = %s", key, r[key])
            if r.get("stale_runs"):
                log.warning("validation: possibly stale series %s", r["stale_runs"])

    # The web process keys its price cache on the id of the latest successful
    # update plus the price row count, so it reloads on its own after this job
    # commits. This call only clears the cache inside *this* process.
    store.invalidate()
    return 0 if upd.status == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
