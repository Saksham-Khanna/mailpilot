"""Tests for AI email classification and opportunity extraction routes."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest
from unittest.mock import patch


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


def test_classify_via_n8n_webhook_mock(client, auth_cookies, csrf_headers, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    gmail_store.upsert_messages(
        user_id=user_id,
        messages=[{
            "gmail_message_id": "msg-n8n",
            "gmail_thread_id": "thread-n8n",
            "sender_name": "Tech Corp",
            "sender_email": "jobs@techcorp.com",
            "recipient": "me@example.com",
            "subject": "Backend Developer Position",
            "received_at": None,
            "snippet": "Join our backend team...",
            "body_text": "We are hiring a Backend Developer. Salary: $140k.",
            "body_source": "text",
            "labels": ["INBOX"],
            "has_body": True,
        }],
        synced_at=None,
    )

    class MockResponse:
        status_code = 200
        def json(self):
            return {
                "category": "Job Opportunity",
                "summary": "Hiring Backend Developer",
                "priority": "High",
                "confidence": 0.98,
                "opportunity": {
                    "company_name": "Tech Corp",
                    "job_role": "Backend Developer",
                    "location": "Remote",
                    "work_mode": "Remote",
                    "salary": "$140k",
                    "skills": ["Python", "FastAPI"],
                    "deadline": "2026-12-31",
                    "application_link": "https://techcorp.com/apply"
                }
            }

    with patch("requests.post", return_value=MockResponse()):
        res = client.post(
            "/api/opportunities/classify",
            headers=csrf_headers,
            cookies=auth_cookies,
            json={"message_id": "msg-n8n"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["classified_count"] == 1
        item = data["items"][0]
        assert item["category"] == "Job Opportunity"
        assert item["opportunity"]["company_name"] == "Tech Corp"
        assert item["opportunity"]["job_role"] == "Backend Developer"


def test_classify_sanitize_job_alert_digest(client, auth_cookies, csrf_headers, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    subject_text = "Software Engineer and 10 other jobs matching your alert"
    gmail_store.upsert_messages(
        user_id=user_id,
        messages=[{
            "gmail_message_id": "msg-digest",
            "gmail_thread_id": "thread-digest",
            "sender_name": "LinkedIn Job Alerts",
            "sender_email": "jobalerts@linkedin.com",
            "recipient": "me@example.com",
            "subject": subject_text,
            "received_at": None,
            "snippet": "New jobs matching your alert...",
            "body_text": "Here are 10 new jobs matching your profile.",
            "body_source": "text",
            "labels": ["INBOX"],
            "has_body": True,
        }],
        synced_at=None,
    )

    class MockDigestResponse:
        status_code = 200
        def json(self):
            return {
                "category": "Job Opportunity",
                "summary": "Job digest alert",
                "priority": "Low",
                "confidence": 0.8,
                "opportunity": {
                    "company_name": "LinkedIn",
                    "job_role": subject_text,
                    "location": None,
                    "work_mode": None,
                    "salary": None,
                    "skills": [],
                    "deadline": None,
                    "application_link": None
                }
            }

    with patch("requests.post", return_value=MockDigestResponse()):
        res = client.post(
            "/api/opportunities/classify",
            headers=csrf_headers,
            cookies=auth_cookies,
            json={"message_id": "msg-digest"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["classified_count"] == 1
        item = data["items"][0]
        # Sanitization should result in opportunity being null if both company and role are invalid/digest placeholders
        assert item["opportunity"] is None

