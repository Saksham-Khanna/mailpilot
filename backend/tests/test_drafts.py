"""Tests for AI reply drafts and Gmail sending routes."""

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


def test_list_drafts_empty(client, auth_cookies):
    res = client.get("/api/drafts", cookies=auth_cookies)
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_generate_and_update_draft(client, auth_cookies, csrf_headers, gmail_store, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    gmail_store.upsert_messages(
        user_id=user_id,
        messages=[{
            "gmail_message_id": "msg-draft-1",
            "gmail_thread_id": "thread-1",
            "sender_name": "Recruiter Jane",
            "sender_email": "jane@company.com",
            "recipient": "me@example.com",
            "subject": "Interview Invitation - Software Engineer",
            "received_at": None,
            "snippet": "We would like to invite you for an interview...",
            "body_text": "Hi, we loved your profile and want to schedule an interview.",
            "body_source": "text",
            "labels": ["INBOX"],
            "has_body": True,
        }],
        synced_at=None,
    )

    class MockGroqResponse:
        status_code = 200
        def json(self):
            return {
                "choices": [{
                    "message": {
                        "content": '{"subject": "Re: Interview Invitation", "body": "Dear Jane,\\n\\nI would love to interview!"}'
                    }
                }]
            }

    with patch("requests.post", return_value=MockGroqResponse()):
        res = client.post(
            "/api/drafts/generate",
            headers=csrf_headers,
            cookies=auth_cookies,
            json={"message_id": "msg-draft-1", "reply_type": "interview_invite"},
        )
        assert res.status_code == 200
        draft_data = res.json()
        assert "Interview Invitation" in draft_data["subject"]
        assert "Jane" in draft_data["body"]
        draft_id = draft_data["draft_id"]

        # Update draft
        res_update = client.put(
            f"/api/drafts/{draft_id}",
            headers=csrf_headers,
            cookies=auth_cookies,
            json={"body": "Updated draft body content", "status": "saved"},
        )
        assert res_update.status_code == 200
        assert res_update.json()["body"] == "Updated draft body content"
        assert res_update.json()["status"] == "saved"


def test_send_draft_missing_scope(client, auth_cookies, csrf_headers, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    gmail_store.upsert_connection(
        user_id=user_id,
        google_email="test@gmail.com",
        scopes=["https://www.googleapis.com/auth/gmail.readonly"], # Missing gmail.send
    )
    cipher = client.app.state.token_cipher
    gmail_store.upsert_credentials(
        user_id=user_id,
        encrypted_access_token=cipher.encrypt("access"),
        encrypted_refresh_token=cipher.encrypt("refresh"),
        access_token_expires_at=None,
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
        token_uri="https://oauth2.googleapis.com/token",
    )
    gmail_store.upsert_draft(
        user_id=user_id,
        draft_id="draft-noscope",
        data={
            "message_id": "msg-1",
            "thread_id": "thread-1",
            "reply_type": "general_reply",
            "recipient": "test@company.com",
            "subject": "Re: Test",
            "body": "Hello",
            "status": "draft",
        },
    )

    res = client.post(
        "/api/drafts/draft-noscope/send",
        headers=csrf_headers,
        cookies=auth_cookies,
    )
    assert res.status_code == 403
    assert "gmail_send_permission_required" in res.json()["detail"] or "send permission" in res.json()["detail"]


def test_send_draft_success(client, auth_cookies, csrf_headers, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    gmail_store.upsert_connection(
        user_id=user_id,
        google_email="test@gmail.com",
        scopes=["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    )
    cipher = client.app.state.token_cipher
    gmail_store.upsert_credentials(
        user_id=user_id,
        encrypted_access_token=cipher.encrypt("access"),
        encrypted_refresh_token=cipher.encrypt("refresh"),
        access_token_expires_at=None,
        scopes=["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
        token_uri="https://oauth2.googleapis.com/token",
    )
    gmail_store.upsert_draft(
        user_id=user_id,
        draft_id="draft-success",
        data={
            "message_id": "msg-1",
            "thread_id": "thread-1",
            "reply_type": "general_reply",
            "recipient": "test@company.com",
            "subject": "Re: Test",
            "body": "Hello",
            "status": "draft",
        },
    )

    class MockGmailClient:
        def __init__(self, credentials, **kwargs):
            pass
        def send_message(self, to, subject, body, thread_id=None):
            return {"id": "sent-msg-123"}

    client.app.state.gmail_client_factory = MockGmailClient

    res = client.post(
        "/api/drafts/draft-success/send",
        headers=csrf_headers,
        cookies=auth_cookies,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["sent"] is True
    assert data["google_message_id"] == "sent-msg-123"

    # Attempting to send again should prevent duplicate send (400)
    res_dup = client.post(
        "/api/drafts/draft-success/send",
        headers=csrf_headers,
        cookies=auth_cookies,
    )
    assert res_dup.status_code == 400
    assert "already been sent" in res_dup.json()["detail"]


def test_reply_eligibility_and_no_reply_protection(client, auth_cookies, csrf_headers, gmail_store, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    
    gmail_store.upsert_messages(
        user_id=user_id,
        messages=[{
            "gmail_message_id": "msg-noreply-1",
            "gmail_thread_id": "thread-noreply-1",
            "sender_name": "Acme ATS",
            "sender_email": "noreply@acme.com",
            "recipient": "me@example.com",
            "subject": "Application Received: Software Engineer",
            "received_at": None,
            "snippet": "Thank you for applying. We have received your application...",
            "body_text": "Thank you for applying. Your application has been received and is under review.",
            "body_source": "text",
            "labels": ["INBOX"],
            "has_body": True,
        }],
        synced_at=None,
    )

    # Attempt to generate draft without confirmation -> should fail with 400
    res = client.post(
        "/api/drafts/generate",
        headers=csrf_headers,
        cookies=auth_cookies,
        json={"message_id": "msg-noreply-1", "reply_type": "application_followup"},
    )
    assert res.status_code == 400
    err_data = res.json()["detail"]
    assert err_data["error_code"] == "reply_not_needed"
    assert err_data["reply_eligibility"] == "no_reply_needed"

    # Attempt to generate draft with confirm_no_reply=True -> should succeed
    class MockGroqResponse:
        status_code = 200
        def json(self):
            return {
                "choices": [{
                    "message": {
                        "content": '{"subject": "Re: Application", "body": "Hello"}'
                    }
                }]
            }

    with patch("requests.post", return_value=MockGroqResponse()):
        res_confirmed = client.post(
            "/api/drafts/generate",
            headers=csrf_headers,
            cookies=auth_cookies,
            json={"message_id": "msg-noreply-1", "reply_type": "application_followup", "confirm_no_reply": True},
        )
        assert res_confirmed.status_code == 200
        assert res_confirmed.json()["reply_eligibility"] == "no_reply_needed"


def test_reply_eligibility_job_alerts_and_rejections(client, auth_cookies, csrf_headers, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    
    gmail_store.upsert_messages(
        user_id=user_id,
        messages=[
            {
                "gmail_message_id": "msg-alert-unique-99",
                "gmail_thread_id": "thread-alert-99",
                "sender_name": "Job Alerts",
                "sender_email": "alerts@indeed.com",
                "recipient": "me@example.com",
                "subject": "New jobs matching your search",
                "received_at": None,
                "snippet": "Here are new job listings...",
                "body_text": "Here are new job alerts for software engineer.",
                "body_source": "text",
                "labels": ["INBOX"],
                "has_body": True,
            },
            {
                "gmail_message_id": "msg-rejection-unique-99",
                "gmail_thread_id": "thread-rejection-99",
                "sender_name": "Tech Corp HR",
                "sender_email": "hr@techcorp.com",
                "recipient": "me@example.com",
                "subject": "Update on your application",
                "received_at": None,
                "snippet": "Unfortunately we decided not to move forward...",
                "body_text": "Unfortunately, we have decided not to move forward with your application at this time.",
                "body_source": "text",
                "labels": ["INBOX"],
                "has_body": True,
            }
        ],
        synced_at=None,
    )

    res_class = client.post(
        "/api/opportunities/classify",
        headers=csrf_headers,
        cookies=auth_cookies,
        json={"limit": 10},
    )
    assert res_class.status_code == 200
    items = res_class.json()["items"]
    eligibilities = {item["message_id"]: item["reply_eligibility"] for item in items}
    assert eligibilities.get("msg-alert-unique-99") == "no_reply_needed"
    assert eligibilities.get("msg-rejection-unique-99") == "no_reply_needed"

