"""API integration tests (blueprint section 30: "Integration tests")."""

import uuid

import pytest


def _email():
    return f"user-{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture()
def user_client(client, signup_verified):
    client.cookies.clear()
    signup_verified(client, _email())
    return client


@pytest.fixture()
def portfolio(user_client):
    r = user_client.post("/portfolios", json={"name": "Core", "holdings": [
        {"ticker": "NVDA", "quantity": 5, "average_cost": 170},
        {"ticker": "MSFT", "quantity": 3, "average_cost": 510},
        {"ticker": "AAPL", "quantity": 10, "average_cost": 200},
        {"ticker": "JPM", "quantity": 8, "average_cost": 250},
        {"ticker": "XOM", "quantity": 12, "average_cost": 100},
    ]})
    assert r.status_code == 201, r.text
    return r.json()


# --- auth ------------------------------------------------------------------------------------------

def test_health_and_data_status(client):
    assert client.get("/health").json() == {"status": "ok"}
    status = client.get("/meta/data-status").json()
    assert status["assets"] >= 30 and status["last_updated"]


def test_signup_requires_verification_then_login(client):
    client.cookies.clear()
    email = _email()
    r = client.post("/auth/signup", json={"full_name": "A", "email": email, "password": "Passw0rd!", "accept_terms": True})
    assert r.status_code == 201 and r.json()["requires_verification"]
    r = client.post("/auth/login", json={"email": email, "password": "Passw0rd!"})
    assert r.status_code == 403
    token = client.post("/auth/resend-verification", json={"email": email}).json()["dev_link"].split("token=")[1]
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": email, "password": "wrong-pass1"}).status_code == 401
    r = client.post("/auth/login", json={"email": email, "password": "Passw0rd!"})
    assert r.status_code == 200 and r.json()["user"]["email"] == email
    assert client.get("/auth/me").status_code == 200
    client.post("/auth/logout")
    assert client.get("/auth/me").status_code == 401


def test_signup_validation(client):
    r = client.post("/auth/signup", json={"full_name": "A", "email": "x@example.com", "password": "short",
                                          "accept_terms": True})
    assert r.status_code == 422
    r = client.post("/auth/signup", json={"full_name": "A", "email": "x@example.com", "password": "Passw0rd!",
                                          "accept_terms": False})
    assert r.status_code == 422


def test_password_reset_flow(client, signup_verified):
    client.cookies.clear()
    email = _email()
    signup_verified(client, email)
    client.cookies.clear()
    link = client.post("/auth/forgot-password", json={"email": email}).json()["dev_link"]
    token = link.split("token=")[1]
    assert client.post("/auth/reset-password", json={"token": token, "password": "N3wPassword"}).status_code == 200
    # The same link cannot be used twice.
    assert client.post("/auth/reset-password", json={"token": token, "password": "An0therPass"}).status_code == 400
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": email, "password": "N3wPassword"}).status_code == 200
    # Unknown emails get the same response (no account enumeration).
    r = client.post("/auth/forgot-password", json={"email": "nobody@example.com"}).json()
    assert r["dev_link"] is None and "If an account exists" in r["message"]


def test_logout_all_invalidates_sessions(user_client):
    old = user_client.cookies.get("qp_session")
    assert user_client.post("/auth/logout-all").status_code == 200
    user_client.cookies.set("qp_session", old)
    assert user_client.get("/auth/me").status_code == 401


def test_cross_origin_write_blocked(user_client):
    r = user_client.post("/portfolios", json={"name": "x"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


# --- portfolios ------------------------------------------------------------------------------------

def test_portfolio_crud_and_valuation(user_client, portfolio):
    pid = portfolio["id"]
    val = portfolio["valuation"]
    assert len(val["holdings"]) == 5
    assert sum(h["weight"] for h in val["holdings"]) == pytest.approx(1.0)
    nvda = next(h for h in val["holdings"] if h["ticker"] == "NVDA")
    assert nvda["invested_value"] == pytest.approx(850)
    assert nvda["current_value"] == pytest.approx(5 * nvda["current_price"])
    # add, duplicate, edit, delete
    r = user_client.post(f"/portfolios/{pid}/holdings", json={"ticker": "spy", "quantity": 1, "average_cost": 500})
    assert r.status_code == 201
    assert user_client.post(f"/portfolios/{pid}/holdings", json={"ticker": "SPY", "quantity": 1,
                                                                 "average_cost": 1}).status_code == 409
    hid = next(h["id"] for h in r.json()["valuation"]["holdings"] if h["ticker"] == "SPY")
    r = user_client.patch(f"/portfolios/{pid}/holdings/{hid}", json={"quantity": 2})
    assert next(h for h in r.json()["valuation"]["holdings"] if h["ticker"] == "SPY")["quantity"] == 2
    r = user_client.delete(f"/portfolios/{pid}/holdings/{hid}")
    assert all(h["ticker"] != "SPY" for h in r.json()["valuation"]["holdings"])
    assert user_client.post(f"/portfolios/{pid}/holdings", json={"ticker": "ZZZZ", "quantity": 1,
                                                                 "average_cost": 1}).status_code == 400


def test_users_cannot_read_each_others_portfolios(client, signup_verified, portfolio):
    pid = portfolio["id"]
    client.cookies.clear()
    signup_verified(client, _email())
    assert client.get(f"/portfolios/{pid}").status_code == 404
    assert client.post("/risk/metrics", json={"portfolio_id": pid}).status_code == 404
    assert all(p["id"] != pid for p in client.get("/portfolios").json())


def test_requires_auth(client):
    client.cookies.clear()
    assert client.get("/portfolios").status_code == 401
    assert client.post("/portfolio/optimize", json={"assets": ["AAPL", "MSFT"]}).status_code == 401


def test_overview(user_client, portfolio):
    r = user_client.get(f"/portfolios/{portfolio['id']}/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["risk"]["metrics"]["volatility"] > 0
    assert len(body["performance"]["series"]) > 10
    assert body["insights"]


# --- analytics -------------------------------------------------------------------------------------

def test_optimize_blueprint_example(user_client):
    r = user_client.post("/portfolio/optimize", json={"assets": ["AAPL", "MSFT", "NVDA", "JPM", "XOM"],
                                                      "capital": 100000, "objective": "max_sharpe",
                                                      "max_single_asset": 0.20, "risk_free_rate": 0.04})
    assert r.status_code == 200, r.text
    body = r.json()
    w = body["optimized"]["weights"]
    assert sum(w.values()) == pytest.approx(1.0, abs=1e-6)
    assert max(w.values()) <= 0.2 + 1e-6
    assert body["explanation"]


def test_optimize_saves_and_retrieves_run(user_client, portfolio):
    r = user_client.post("/portfolio/optimize", json={"portfolio_id": portfolio["id"], "objective": "min_variance",
                                                      "max_single_asset": 0.4, "save": True})
    assert r.status_code == 200, r.text
    run_id = r.json()["run_id"]
    got = user_client.get(f"/runs/{run_id}")
    assert got.status_code == 200 and got.json()["objective"] == "min_variance"
    assert any(x["run_id"] == run_id for x in user_client.get("/runs").json())


def test_optimize_rejects_bad_input(user_client):
    assert user_client.post("/portfolio/optimize", json={"assets": ["NOPE"]}).status_code == 400
    r = user_client.post("/portfolio/optimize", json={"assets": ["AAPL", "MSFT"], "max_single_asset": 0.2})
    assert r.status_code == 422 and "infeasible" in r.json()["detail"]
    assert user_client.post("/portfolio/optimize", json={"assets": ["AAPL"], "objective": "magic"}).status_code == 422


@pytest.mark.parametrize("path,extra", [
    ("/portfolio/frontier", {}),
    ("/risk/metrics", {"confidence": 0.99, "horizon_days": 5}),
    ("/risk/stress", {"custom": {"name": "c", "shocks": {"NVDA": -0.3}}}),
    ("/simulation/monte-carlo", {"n_sims": 500, "horizon_days": 60, "method": "bootstrap"}),
    ("/portfolio/rebalance", {"target_objective": "risk_parity", "whole_shares": True}),
    ("/backtest", {"frequency": "quarterly", "estimation_window": 126}),
])
def test_analytics_endpoints(user_client, portfolio, path, extra):
    r = user_client.post(path, json={"portfolio_id": portfolio["id"], **extra})
    assert r.status_code == 200, r.text


def test_stress_has_three_or_more_scenarios(user_client, portfolio):
    body = user_client.post("/risk/stress", json={"portfolio_id": portfolio["id"]}).json()
    assert len(body["results"]) >= 3
    for res in body["results"]:
        assert res["value_after"] == pytest.approx(res["value_before"] + res["pnl"])


def test_monte_carlo_limits(user_client, portfolio):
    r = user_client.post("/simulation/monte-carlo", json={"portfolio_id": portfolio["id"], "n_sims": 20000,
                                                          "horizon_days": 2520})
    assert r.status_code == 400


@pytest.mark.parametrize("action", [
    {"type": "add_cash", "amount": 1000},
    {"type": "asset_shock", "ticker": "NVDA", "shock": -0.2},
    {"type": "market_shock", "shock": -0.15},
    {"type": "reduce_holding", "ticker": "NVDA", "percentage_points": 0.05},
    {"type": "rebalance_to", "weights": {"AAPL": 0.5, "MSFT": 0.5}},
])
def test_what_if(user_client, portfolio, action):
    r = user_client.post("/what-if", json={"portfolio_id": portfolio["id"], "action": action})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["risk_before"]["volatility"] > 0 and body["risk_after"]["volatility"] > 0


def test_preferences_round_trip(user_client):
    prefs = user_client.get("/me/preferences").json()
    prefs["risk_free_rate"] = 0.03
    assert user_client.put("/me/preferences", json=prefs).json()["risk_free_rate"] == 0.03
    assert user_client.put("/me/preferences", json={**prefs, "confidence": 2}).status_code == 422


def test_demo_account(client):
    client.cookies.clear()
    r = client.post("/auth/demo")
    assert r.status_code == 200
    pid = r.json()["user"]["default_portfolio_id"]
    assert client.get(f"/portfolios/{pid}/overview").status_code == 200


def test_cors_origins_accepts_a_comma_separated_env_value(monkeypatch):
    """.env.example documents CORS_ORIGINS=a,b, so the comma form has to parse.

    pydantic-settings JSON-decodes complex types from the environment by default,
    which rejected the documented form until the field was marked NoDecode.
    """
    from app.core.config import Settings

    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com, https://staging.example.com")
    assert Settings().cors_origins == ["https://app.example.com", "https://staging.example.com"]

    monkeypatch.setenv("CORS_ORIGINS", '["https://only.example.com"]')
    assert Settings().cors_origins == ["https://only.example.com"]


def test_cross_origin_write_is_blocked_and_says_how_to_fix_it(user_client):
    res = user_client.patch("/me", json={"full_name": "Hacked"}, headers={"Origin": "https://evil.example"})
    assert res.status_code == 403
    detail = res.json()["detail"]
    # The frontend proxies /api/* and forwards the browser's Origin, so a deployment
    # that forgets CORS_ORIGINS sees every write fail. The message has to name the fix.
    assert "evil.example" in detail
    assert "CORS_ORIGINS" in detail
