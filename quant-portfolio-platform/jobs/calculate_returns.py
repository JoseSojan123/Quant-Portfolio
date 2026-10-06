#!/usr/bin/env python3
"""Recompute the stored daily return series from the stored prices.

``update_market_data.py`` already does this after every price refresh, so this
job exists for the cases where only the returns need rebuilding:

* after a manual correction to ``prices_daily``;
* after restoring a price dump that carries no returns;
* after changing the return convention in ``quant.features.returns``.

It is safe to run repeatedly: returns are upserted on (asset_id, date), so a run
converges on the same table rather than duplicating rows.

    python jobs/calculate_returns.py                 # every asset
    python jobs/calculate_returns.py --tickers AAPL,MSFT
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]

from sqlalchemy import select  # noqa: E402

from app.db.models import Asset, Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.services.market_data import store  # noqa: E402
from app.services.pipeline import recalculate_returns  # noqa: E402

log = logging.getLogger("jobs.calculate_returns")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tickers", help="comma-separated subset; default is every asset")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(name)s %(message)s")

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        asset_ids = None
        if args.tickers:
            wanted = [t.strip().upper() for t in args.tickers.split(",")]
            rows = session.execute(select(Asset.asset_id, Asset.ticker).where(Asset.ticker.in_(wanted))).all()
            found = {t for _, t in rows}
            missing = [t for t in wanted if t not in found]
            if missing:
                log.error("unknown ticker(s): %s", ", ".join(missing))
                return 1
            asset_ids = [i for i, _ in rows]

        n = recalculate_returns(session, asset_ids)
        session.commit()
        log.info("wrote %s return rows", n)

    store.invalidate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
