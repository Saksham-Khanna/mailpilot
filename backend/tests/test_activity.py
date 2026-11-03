"""Tests for activity logs and audit trail endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest


@pytest.fixture
def client(gmail_app) -> TestClient:
    return TestClient(gmail_app)


@pytest.fixture
def auth_cookies(client: TestClient) -> dict[str, str]:
    client.get("/api/auth/session")
    return dict(client.cookies)


@pytest.fixture
def csrf_headers(client: TestClient, auth_cookies) -> dict[str, str]:
    data = client.get("/api/auth/session", cookies=auth_cookies).json()
    return {"X-CSRF-Token": data["csrf_token"]}


def test_activity_logs_empty(client, auth_cookies):
    res = client.get("/api/logs", cookies=auth_cookies)
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_record_and_retrieve_activity_logs(client, auth_cookies, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])

    # Record logs directly via store
    store = gmail_store
    store.record_activity(
        user_id=user_id,
        activity_type="gmail_connected",
        description="Gmail connected successfully.",
        status="success",
    )
    store.record_activity(
        user_id=user_id,
        activity_type="sync_failed",
        description="Sync failed due to timeout.",
        status="failed",
        metadata={"error": "timeout"},
    )

    res = client.get("/api/logs", cookies=auth_cookies)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    # Sorted by timestamp descending, so most recent ("sync_failed") first
    assert data["items"][0]["activity_type"] == "sync_failed"
    assert data["items"][0]["status"] == "failed"
    assert data["items"][1]["activity_type"] == "gmail_connected"
    assert data["items"][1]["status"] == "success"


def test_filter_activity_logs(client, auth_cookies, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    store = gmail_store

    store.record_activity(user_id=user_id, activity_type="draft_generated", description="Draft gen 1", status="success")
    store.record_activity(user_id=user_id, activity_type="email_sent", description="Email sent 1", status="success")
    store.record_activity(user_id=user_id, activity_type="workflow_error", description="Error 1", status="failed")

    # Filter by activity_type
    res = client.get("/api/logs?activity_type=email_sent", cookies=auth_cookies)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["activity_type"] == "email_sent"

    # Filter by status
    res_status = client.get("/api/logs?status=failed", cookies=auth_cookies)
    assert res_status.status_code == 200
    data_status = res_status.json()
    assert data_status["total"] == 1
    assert data_status["items"][0]["status"] == "failed"


def test_activity_logs_user_isolation(client, auth_cookies, gmail_store):
    user_id_1 = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    store = gmail_store

    # Record log for user 1
    store.record_activity(user_id=user_id_1, activity_type="gmail_connected", description="User 1 connected", status="success")

    # Create another session / user
    client2 = TestClient(client.app)
    client2.get("/api/auth/session")
    cookies2 = dict(client2.cookies)
    user_id_2 = client2.app.state.session_signer.verify(cookies2["mailpilot_session"])

    # Record log for user 2
    store.record_activity(user_id=user_id_2, activity_type="gmail_connected", description="User 2 connected", status="success")

    # User 1 should only see user 1's logs
    res1 = client.get("/api/logs", cookies=auth_cookies)
    assert res1.status_code == 200
    items1 = res1.json()["items"]
    assert len(items1) == 1
    assert "User 1" in items1[0]["description"]

    # User 2 should only see user 2's logs
    res2 = client2.get("/api/logs", cookies=cookies2)
    assert res2.status_code == 200
    items2 = res2.json()["items"]
    assert len(items2) == 1
    assert "User 2" in items2[0]["description"]
