"""Tests for AI email classification and opportunity extraction routes."""

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


def test_list_opportunities_empty(client, auth_cookies):
    res = client.get("/api/opportunities", cookies=auth_cookies)
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_classify_messages_unauthorized_csrf(client, auth_cookies):
    res = client.post("/api/opportunities/classify", cookies=auth_cookies)
    assert res.status_code == 403


def test_classify_and_list_opportunities(client, auth_cookies, csrf_headers, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    gmail_store.upsert_messages(
        user_id=user_id,
        messages=[{
            "gmail_message_id": "msg-123",
            "gmail_thread_id": "thread-123",
            "sender_name": "Acme Recruiter",
            "sender_email": "recruiter@acme.com",
            "recipient": "me@example.com",
            "subject": "Software Engineer Job Opportunity at Acme",
            "received_at": None,
            "snippet": "We have an open role for Software Engineer...",
            "body_text": "We have an open role for Software Engineer at Acme. Location: Remote. Salary: $120k.",
            "body_source": "text",
            "labels": ["INBOX"],
            "has_body": True,
        }],
        synced_at=None,
    )
    
    res = client.post(
        "/api/opportunities/classify",
        headers=csrf_headers,
        cookies=auth_cookies,
        json={"limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["classified_count"] == 1
    assert data["items"][0]["category"] == "Job Opportunity"

    # List opportunities
    res_list = client.get("/api/opportunities", cookies=auth_cookies)
    assert res_list.status_code == 200
    list_data = res_list.json()
    assert list_data["total"] == 1
    assert len(list_data["items"]) == 1
