"""FastAPI application entry point.

Run locally:  uvicorn app.main:app --reload --port 8000   (from the backend/ directory)
Interactive API docs: http://localhost:8000/docs
"""

from __future__ import annotations

import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

# Make the repository-level `quant` package importable without installing it.
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app.api import analytics, auth, market, me, portfolios, runs  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.services.market_data import store  # noqa: E402
from app.services.pipeline import ensure_seeded  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("qpp")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if settings.auto_seed:
        with SessionLocal() as db:
            ensure_seeded(db, settings.data_source)
            store.get(db)  # warm the cache
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Quantitative portfolio construction & risk engine: returns, covariance, constrained optimization, "
                "risk decomposition, VaR/ES, Monte Carlo, stress testing, rebalancing and walk-forward backtests.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # CSRF defence in depth (on top of SameSite=Lax cookies): browsers always send Origin on
    # cross-site writes, so reject cookie-authenticated writes from origins we do not know.
    if request.method in UNSAFE and settings.cookie_name in request.cookies:
        origin = request.headers.get("origin")
        if origin and origin not in settings.cors_origins:
            # The frontend proxies /api/* to this service and forwards the browser's
            # Origin, so the frontend's own public URL has to be an allowed origin.
            # Say so: a silent 403 on every write is otherwise hard to diagnose.
            log.warning("Blocked a write from origin %s; allowed origins are %s", origin, settings.cors_origins)
            return JSONResponse(
                {"detail": f"Cross-origin request blocked: {origin} is not an allowed origin. "
                            "Add it to CORS_ORIGINS (or set FRONTEND_URL) on the API."},
                status_code=403)
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Response-Time-ms"] = f"{(time.perf_counter() - start) * 1000:.0f}"
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = exc.errors()
    first = errors[0] if errors else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:]) if first else ""
    msg = first.get("msg", "Invalid request").removeprefix("Value error, ")
    return JSONResponse({"detail": f"{field}: {msg}" if field else msg,
                         "errors": [{"loc": e.get("loc"), "msg": e.get("msg")} for e in errors]}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error")  # stack trace in logs, never secrets in the response
    return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


for r in (auth.router, me.router, portfolios.router, analytics.router, runs.router, market.router):
    app.include_router(r)
