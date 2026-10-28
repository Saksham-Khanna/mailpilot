import base64
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from fastapi.testclient import TestClient

from app.services import google_oauth
from app.services.gmail_client import GmailAuthError, GmailRateLimitError, GmailUnavailableError
from app.services.gmail_sync import GmailNotConnected
from app.services.google_oauth import GMAIL_SCOPES, OAuthTokens


NOW = datetime.now(tz=timezone.utc)


def b64(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def raw_message(message_id: str, subject: str, body: str) -> dict:
    return {
        "id": message_id,
        "threadId": f"thread-{message_id}",
        "snippet": body[:40],
        "internalDate": str(int(NOW.timestamp() * 1000)),
        "labelIds": ["INBOX", "UNREAD"],
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": "Sender <sender@example.com>"},
                {"name": "To", "value": "me@example.com"},
                {"name": "Subject", "value": subject},
                {"name": "Date", "value": "Tue, 14 Nov 2023 22:13:20 +0000"},
            ],
            "body": {"data": b64(body)},
        },
    }


def csrf(client: TestClient) -> str:
    return client.get("/api/auth/session").json()["csrf_token"]


def user_id(client: TestClient) -> str:
    if not client.cookies.get("mailpilot_session"):
        csrf(client)
    return client.app.state.session_signer.verify(
        client.cookies.get("mailpilot_session")
    )


def seed_connection(store, cipher, uid: str, email: str = "user@example.com") -> None:
    store.upsert_connection(user_id=uid, google_email=email, scopes=list(GMAIL_SCOPES))
    store.upsert_credentials(
        user_id=uid,
        encrypted_access_token=cipher.encrypt("access-token"),
        encrypted_refresh_token=cipher.encrypt("refresh-token"),
        access_token_expires_at=NOW + timedelta(hours=1),
        scopes=list(GMAIL_SCOPES),
        token_uri=google_oauth.TOKEN_URI,
    )


class FakeGmailClient:
    profile = {"emailAddress": "user@example.com", "historyId": "history-1"}
    message_ids = ["m1", "m2"]
    messages = {
        "m1": raw_message("m1", "First", "Hello from m1"),
        "m2": raw_message("m2", "Second", "Hello from m2"),
    }
    profile_error = None

    def __init__(self, credentials, *, on_token_refresh=None):
        self.credentials = credentials
        self.on_token_refresh = on_token_refresh

    def get_profile(self):
        if self.profile_error is not None:
            raise self.profile_error
        return dict(self.profile)

    def list_recent_inbox_message_ids(self, limit):
        return list(self.message_ids)[:limit]

    def get_message(self, message_id):
        return self.messages[message_id]


class FailingProfileClient(FakeGmailClient):
    def __init__(self, credentials, *, on_token_refresh=None, error=None):
        super().__init__(credentials, on_token_refresh=on_token_refresh)
        self.error = error

    def get_profile(self):
        raise self.error


def fake_exchange(*, scopes=None, refresh=True):
    def exchange(settings, code, verifier):
        assert verifier == "test-verifier"
        assert code == "test-code"
        return OAuthTokens(
            access_token="access-token-value",
            refresh_token="refresh-token-value" if refresh else "",
            expiry=NOW + timedelta(hours=1),
            scopes=tuple(scopes or GMAIL_SCOPES),
            token_uri=google_oauth.TOKEN_URI,
        )

    return exchange


def patch_start(monkeypatch):
    def create(settings, state):
        return f"https://accounts.google.com/o/oauth2/auth?state={state}", "test-verifier"

    monkeypatch.setattr(google_oauth, "create_authorization_request", create)


def start_state(client: TestClient) -> str:
    response = client.get("/api/auth/google/start", follow_redirects=False)
    assert response.status_code == 302
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def test_oauth_start_requires_configuration(gmail_app, monkeypatch):
    from app.api.routes import auth as auth_route
    from app.core.config import Settings

    monkeypatch.setattr(auth_route, "get_settings", lambda: Settings())
    client = TestClient(gmail_app)
    response = client.get("/api/auth/google/start", follow_redirects=False)
    assert response.status_code == 503


def test_oauth_connect_flow_and_encrypted_persistence(
    gmail_app, gmail_store, monkeypatch, token_key
):
    patch_start(monkeypatch)
    monkeypatch.setattr(google_oauth, "exchange_code", fake_exchange())
    gmail_app.state.gmail_client_factory = FakeGmailClient
    client = TestClient(gmail_app)
    state = start_state(client)
    uid = user_id(client)

    # State is stored only as a hash and verifier is encrypted.
    state_docs = list(gmail_store.oauth_states.find({}))
    assert len(state_docs) == 1
    assert state_docs[0]["_id"] != state
    assert "test-verifier" not in str(state_docs[0])

    callback = client.get(
        f"/api/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert callback.status_code == 302
    assert "gmail=connected" in callback.headers["location"]
    assert callback.headers["location"].endswith("#/inbox")

    status = client.get("/api/gmail/status").json()
    assert status["connected"] is True
    assert status["google_email"] == "user@example.com"
    assert status["message_count"] == 0

    credential_document = gmail_store.get_credentials(uid)
    assert "access-token-value" not in str(credential_document)
    assert "refresh-token-value" not in str(credential_document)
    cipher = gmail_app.state.token_cipher
    assert cipher.decrypt(credential_document["encrypted_access_token"]) == "access-token-value"
    assert (
        cipher.decrypt(credential_document["encrypted_refresh_token"])
        == "refresh-token-value"
    )

    # Replay is rejected and does not re-exchange.
    replay = client.get(
        f"/api/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert "gmail=error" in replay.headers["location"]
    assert "invalid_state" in replay.headers["location"]


def test_oauth_state_is_bound_to_session_user(gmail_app, monkeypatch):
    patch_start(monkeypatch)
    exchange_calls = []

    def exchange(settings, code, verifier):
        exchange_calls.append(code)
        return OAuthTokens(
            access_token="access-token-value",
            refresh_token="refresh-token-value",
            expiry=NOW + timedelta(hours=1),
            scopes=tuple(GMAIL_SCOPES),
            token_uri=google_oauth.TOKEN_URI,
        )

    monkeypatch.setattr(google_oauth, "exchange_code", exchange)
    gmail_app.state.gmail_client_factory = FakeGmailClient
    owner = TestClient(gmail_app)
    attacker = TestClient(gmail_app)
    state = start_state(owner)
    attacker.get("/api/auth/session")

    rejected = attacker.get(
        f"/api/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert "invalid_state" in rejected.headers["location"]
    assert exchange_calls == []

    accepted = owner.get(
        f"/api/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert "gmail=connected" in accepted.headers["location"]
    assert exchange_calls == ["test-code"]


def test_oauth_error_callback_and_missing_parameters(gmail_app, monkeypatch):
    patch_start(monkeypatch)
    gmail_app.state.gmail_client_factory = FakeGmailClient
    client = TestClient(gmail_app)
    state = start_state(client)

    missing = client.get("/api/auth/google/callback?code=only", follow_redirects=False)
    assert "invalid_callback" in missing.headers["location"]

    denied = client.get(
        f"/api/auth/google/callback?error=access_denied&state={state}",
        follow_redirects=False,
    )
    assert "gmail=error" in denied.headers["location"]
    assert "access_denied" in denied.headers["location"]
    # The denied state is consumed.
    reused = client.get(
        f"/api/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert "invalid_state" in reused.headers["location"]


def test_oauth_exchange_failure_does_not_connect(gmail_app, monkeypatch):
    patch_start(monkeypatch)

    def fail(settings, code, verifier):
        raise google_oauth.OAuthExchangeError("no")

    monkeypatch.setattr(google_oauth, "exchange_code", fail)
    client = TestClient(gmail_app)
    state = start_state(client)
    response = client.get(
        f"/api/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert "exchange_failed" in response.headers["location"]
    assert client.get("/api/gmail/status").json()["connected"] is False


def test_oauth_expired_state_is_rejected(gmail_app, gmail_store, monkeypatch):
    patch_start(monkeypatch)
    gmail_app.state.gmail_client_factory = FakeGmailClient
    client = TestClient(gmail_app)
    state = start_state(client)
    gmail_store.oauth_states.update_one(
        {}, {"$set": {"expires_at": NOW - timedelta(seconds=1)}}
    )
    response = client.get(
        f"/api/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert "invalid_state" in response.headers["location"]


def test_sync_requires_connection(gmail_app):
    client = TestClient(gmail_app)
    response = client.post(
        "/api/gmail/sync", headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.status_code == 409


def test_sync_messages_detail_and_deduplication(gmail_app, gmail_store):
    gmail_app.state.gmail_client_factory = FakeGmailClient
    client = TestClient(gmail_app)
    uid = user_id(client)
    seed_connection(gmail_store, gmail_app.state.token_cipher, uid)
    headers = {"X-CSRF-Token": csrf(client)}

    first = client.post("/api/gmail/sync", headers=headers)
    assert first.status_code == 200
    body = first.json()
    assert body["new_messages"] == 2
    assert body["total_stored"] == 2
    assert "access-token-value" not in first.text
    assert "refresh-token-value" not in first.text

    second = client.post("/api/gmail/sync", headers=headers)
    assert second.status_code == 200
    assert second.json()["new_messages"] == 0
    assert second.json()["total_stored"] == 2

    listed = client.get("/api/gmail/messages").json()
    assert listed["total"] == 2
    assert listed["items"][0]["id"] in {"m1", "m2"}
    assert "body_text" not in listed["items"][0]
    detail = client.get(f"/api/gmail/messages/{listed['items'][0]['id']}")
    assert detail.status_code == 200
    assert detail.json()["body_text"].startswith("Hello from")
    assert "access-token" not in detail.text

    missing = client.get("/api/gmail/messages/not-owned")
    assert missing.status_code == 404


def test_sync_limit_is_applied(gmail_app, gmail_store):
    gmail_app.state.gmail_client_factory = FakeGmailClient
    client = TestClient(gmail_app)
    uid = user_id(client)
    seed_connection(gmail_store, gmail_app.state.token_cipher, uid)
    response = client.post(
        "/api/gmail/sync?limit=1",
        headers={"X-CSRF-Token": csrf(client)},
    )
    assert response.status_code == 200
    assert response.json()["considered"] == 1
    assert response.json()["total_stored"] == 1


def test_cross_user_isolation(gmail_app, gmail_store):
    gmail_app.state.gmail_client_factory = FakeGmailClient
    owner = TestClient(gmail_app)
    other = TestClient(gmail_app)
    owner_uid = user_id(owner)
    other_uid = user_id(other)
    seed_connection(gmail_store, gmail_app.state.token_cipher, owner_uid)
    seed_connection(gmail_store, gmail_app.state.token_cipher, other_uid, "other@example.com")

    owner.post("/api/gmail/sync", headers={"X-CSRF-Token": csrf(owner)})
    assert owner.get("/api/gmail/messages").json()["total"] == 2
    assert other.get("/api/gmail/messages").json()["total"] == 0
    assert other.get("/api/gmail/status").json()["google_email"] == "other@example.com"

    message_id = owner.get("/api/gmail/messages").json()["items"][0]["id"]
    assert owner.get(f"/api/gmail/messages/{message_id}").status_code == 200
    assert other.get(f"/api/gmail/messages/{message_id}").status_code == 404


def test_gmail_auth_error_marks_reconnect(gmail_app, gmail_store):
    gmail_app.state.gmail_client_factory = lambda credentials, on_token_refresh=None: (
        FailingProfileClient(credentials, on_token_refresh=on_token_refresh, error=GmailAuthError())
    )
    client = TestClient(gmail_app)
    uid = user_id(client)
    seed_connection(gmail_store, gmail_app.state.token_cipher, uid)
    response = client.post(
        "/api/gmail/sync", headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.status_code == 401
    status = client.get("/api/gmail/status").json()
    assert status["needs_reconnect"] is True
    assert status["last_error"] == "reauth_required"
    assert "access-token-value" not in response.text


@pytest.mark.parametrize(
    "error,status_code",
    [
        (GmailRateLimitError(), 503),
        (GmailUnavailableError(), 502),
    ],
)
def test_gmail_api_error_mapping(gmail_app, gmail_store, error, status_code):
    gmail_app.state.gmail_client_factory = lambda credentials, on_token_refresh=None: (
        FailingProfileClient(credentials, on_token_refresh=on_token_refresh, error=error)
    )
    client = TestClient(gmail_app)
    uid = user_id(client)
    seed_connection(gmail_store, gmail_app.state.token_cipher, uid)
    response = client.post(
        "/api/gmail/sync", headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.status_code == status_code
    if status_code == 503:
        assert response.headers["retry-after"] == "5"


def test_disconnect_requires_csrf_and_deletes_everything(
    gmail_app, gmail_store, monkeypatch
):
    gmail_app.state.gmail_client_factory = FakeGmailClient
    client = TestClient(gmail_app)
    uid = user_id(client)
    seed_connection(gmail_store, gmail_app.state.token_cipher, uid)
    gmail_store.upsert_messages(
        user_id=uid,
        messages=[
            {
                "gmail_message_id": "m1",
                "gmail_thread_id": "t1",
                "received_at": NOW,
                "subject": "x",
                "labels": [],
                "has_body": False,
            }
        ],
        synced_at=NOW,
    )
    assert client.delete("/api/gmail/connection").status_code == 403

    calls = []

    def fake_post(url, data=None, headers=None, timeout=None):
        calls.append((url, data))
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.services.gmail_sync.requests.post", fake_post)
    response = client.delete(
        "/api/gmail/connection", headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.status_code == 200
    assert response.json()["revoked"] is True
    assert response.json()["deleted_messages"] == 1
    assert "refresh-token-value" not in response.text
    assert calls and calls[0][0] == "https://oauth2.googleapis.com/revoke"
    assert gmail_store.get_connection(uid) is None
    assert gmail_store.get_credentials(uid) is None
    assert gmail_store.count_messages(uid) == 0
    assert client.get("/api/gmail/status").json()["connected"] is False
    assert client.delete(
        "/api/gmail/connection", headers={"X-CSRF-Token": csrf(client)}
    ).status_code == 404


def test_disconnect_deletes_locally_when_revocation_fails(
    gmail_app, gmail_store, monkeypatch
):
    gmail_app.state.gmail_client_factory = FakeGmailClient
    client = TestClient(gmail_app)
    uid = user_id(client)
    seed_connection(gmail_store, gmail_app.state.token_cipher, uid)

    def fail(*args, **kwargs):
        raise requests.RequestException("network")

    monkeypatch.setattr("app.services.gmail_sync.requests.post", fail)
    response = client.delete(
        "/api/gmail/connection", headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.status_code == 200
    assert response.json()["revoked"] is False
    assert gmail_store.get_credentials(uid) is None


def test_disconnect_works_without_encryption_key(gmail_app, gmail_store):
    client = TestClient(gmail_app)
    uid = user_id(client)
    seed_connection(gmail_store, gmail_app.state.token_cipher, uid)
    gmail_app.state.token_cipher = None
    response = client.delete(
        "/api/gmail/connection", headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.status_code == 200
    assert gmail_store.get_credentials(uid) is None


def test_sync_requires_encryption(gmail_app, gmail_store):
    client = TestClient(gmail_app)
    uid = user_id(client)
    seed_connection(gmail_store, gmail_app.state.token_cipher, uid)
    gmail_app.state.token_cipher = None
    response = client.post(
        "/api/gmail/sync", headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.status_code == 503


def test_status_reports_disconnected_without_connection(gmail_app):
    client = TestClient(gmail_app)
    response = client.get("/api/gmail/status")
    assert response.status_code == 200
    assert response.json()["connected"] is False
    assert response.json()["message_count"] == 0
    assert response.headers["cache-control"] == "no-store"
