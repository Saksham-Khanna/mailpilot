import pytest
from fastapi.testclient import TestClient

from app.core.sessions import SESSION_COOKIE_NAME, SessionSigner


SECRET = "s" * 48


def test_session_roundtrip_and_csrf():
    signer = SessionSigner(SECRET, max_age_seconds=60)
    user_id = signer.new_user_id()
    token = signer.issue(user_id, now=1_000)
    assert signer.verify(token, now=1_000) == user_id
    csrf = signer.csrf_for(user_id)
    assert signer.verify_csrf(csrf, user_id)
    assert not signer.verify_csrf(csrf, "another-user")
    assert not signer.verify_csrf(None, user_id)


def test_session_rejects_tampering_expiry_and_future_tokens():
    signer = SessionSigner(SECRET, max_age_seconds=60)
    user_id = signer.new_user_id()
    token = signer.issue(user_id, now=1_000)
    payload, signature = token.split(".", 1)
    assert signer.verify(f"{payload}x.{signature}", now=1_000) is None
    assert signer.verify(token, now=1_061) is None
    assert signer.verify(token, now=1_000 - 301) is None
    assert signer.verify("garbage", now=1_000) is None
    assert signer.verify(None, now=1_000) is None


def test_session_secret_must_be_long():
    with pytest.raises(ValueError):
        SessionSigner("short", max_age_seconds=60)


def test_csrf_header_required_for_state_changing_routes(gmail_app):
    client = TestClient(gmail_app)
    assert client.post("/api/gmail/sync").status_code == 403
    info = client.get("/api/auth/session").json()
    assert client.post(
        "/api/gmail/sync", headers={"X-CSRF-Token": "not-the-token"}
    ).status_code == 403
    # Correct CSRF reaches the service, which reports "not connected".
    assert client.post(
        "/api/gmail/sync", headers={"X-CSRF-Token": info["csrf_token"]}
    ).status_code == 409


def test_session_cookie_is_httponly_and_stable(gmail_app):
    client = TestClient(gmail_app)
    first = client.get("/api/auth/session")
    cookie = first.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    token_one = client.cookies.get(SESSION_COOKIE_NAME)
    assert token_one
    second = client.get("/api/auth/session")
    assert "set-cookie" not in second.headers
    assert client.cookies.get(SESSION_COOKIE_NAME) == token_one


def test_tampered_cookie_gets_a_new_session(gmail_app):
    client = TestClient(gmail_app)
    info = client.get("/api/auth/session").json()
    client.cookies.set(SESSION_COOKIE_NAME, "tampered.value")
    replacement = client.get("/api/auth/session")
    assert replacement.status_code == 200
    assert replacement.headers.get("set-cookie")
    assert replacement.json()["csrf_token"] != info["csrf_token"]


def test_cors_preflight_does_not_create_a_session(gmail_app):
    client = TestClient(gmail_app)
    response = client.options(
        "/api/gmail/sync",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-CSRF-Token",
        },
    )
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
