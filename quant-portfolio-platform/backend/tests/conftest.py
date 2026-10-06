import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

# API tests run against a throwaway SQLite database; set before the app is imported.
_TMP = Path(os.environ.get("PYTEST_DB_DIR", "/tmp")) / f"qpp_test_{os.getpid()}.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP}")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("REQUIRE_EMAIL_VERIFICATION", "true")
os.environ.setdefault("EXPOSE_DEV_LINKS", "true")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production-0123456789")
os.environ.setdefault("HEAVY_RATE_LIMIT_PER_MINUTE", "1000")
os.environ.setdefault("AUTH_RATE_LIMIT_PER_MINUTE", "1000")


@pytest.fixture(scope="session")
def synthetic_prices():
    from quant.data.synthetic import generate_synthetic_prices
    from quant.data.validation import to_price_matrix, validate_prices

    df, _ = validate_prices(generate_synthetic_prices(end="2026-10-02"))
    return to_price_matrix(df)


@pytest.fixture(scope="session")
def returns5(synthetic_prices):
    from quant.features.returns import simple_returns

    return simple_returns(synthetic_prices[["AAPL", "MSFT", "NVDA", "JPM", "XOM"]]).iloc[-756:]


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, base_url="http://localhost") as c:
        yield c
    if _TMP.exists():
        _TMP.unlink()


def _signup_verified(client, email, password="Passw0rd!"):
    r = client.post("/auth/signup", json={"full_name": "Test User", "email": email, "password": password,
                                          "accept_terms": True})
    assert r.status_code == 201, r.text
    token = r.json()["dev_link"].split("token=")[1]
    r = client.post("/auth/verify-email", json={"token": token})
    assert r.status_code == 200, r.text
    return r


@pytest.fixture()
def signup_verified():
    return _signup_verified
