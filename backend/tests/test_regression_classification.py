"""Regression tests for classification pipeline fixes and edge cases."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from app.services.classifier import _heuristic_classify


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


def test_regression_question_mark_does_not_trigger_reply():
    # Quora question subject with question mark
    subject = "If Russia invaded the UK, what would the US do?"
    body = "Trending space question. Answer from community member."
    sender = "Quora Suggested Spaces <space@quora.com>"

    result = _heuristic_classify(subject=subject, body=body, sender=sender)
    assert result["reply_eligibility"] == "no_reply_needed"
    assert result["category"] == "Newsletter"


def test_regression_digest_no_false_opportunity():
    subject = "10 new Software Engineering jobs matching your alert"
    body = "Here are multiple jobs matching your profile from LinkedIn."
    sender = "LinkedIn Job Alerts <jobalerts@linkedin.com>"

    result = _heuristic_classify(subject=subject, body=body, sender=sender)
    assert result["opportunity"] is None


def test_regression_security_notice_classification():
    subject = "Security Alert: New sign-in from iPhone"
    body = "We noticed a login from a new device."
    sender = "Google Security <no-reply@accounts.google.com>"

    result = _heuristic_classify(subject=subject, body=body, sender=sender)
    assert result["category"] == "Security Notice"
    assert result["reply_eligibility"] == "no_reply_needed"
    assert result["priority"] == "High"


def test_regression_billing_invoices_classification():
    subject = "Your AWS monthly invoice is ready"
    body = "Your invoice for $45.00 has been charged to your card ending in 1234."
    sender = "AWS Billing <no-reply@amazon.com>"

    result = _heuristic_classify(subject=subject, body=body, sender=sender)
    assert result["category"] == "Billing & Invoices"
    assert result["reply_eligibility"] == "no_reply_needed"
    assert result["priority"] == "Low"


def test_reclassification_preserves_user_modifications(client, auth_cookies, csrf_headers, gmail_store):
    user_id = client.app.state.session_signer.verify(client.cookies["mailpilot_session"])
    gmail_store.upsert_messages(
        user_id=user_id,
        messages=[{
            "gmail_message_id": "msg-user-mod",
            "gmail_thread_id": "thread-user-mod",
            "sender_name": "Test Recruiter",
            "sender_email": "recruiter@test.com",
            "recipient": "me@example.com",
            "subject": "Software Engineer Role",
            "received_at": None,
            "snippet": "Join our team...",
            "body_text": "We are hiring.",
            "body_source": "text",
            "labels": ["INBOX"],
            "has_body": True,
        }],
        synced_at=None,
    )

    # First classify
    res = client.post(
        "/api/opportunities/classify",
        headers=csrf_headers,
        cookies=auth_cookies,
        json={"message_id": "msg-user-mod"},
    )
    assert res.status_code == 200

    # Mark as user modified in store
    doc = gmail_store.get_classification(user_id=user_id, gmail_message_id="msg-user-mod")
    doc["user_modified"] = True
    doc["category"] = "Offer Letter" # Custom user change
    gmail_store.upsert_classification(user_id=user_id, gmail_message_id="msg-user-mod", data=doc, classified_at=doc["classified_at"])

    # Reclassify with force=True
    res_force = client.post(
        "/api/opportunities/classify",
        headers=csrf_headers,
        cookies=auth_cookies,
        json={"message_id": "msg-user-mod", "force": True},
    )
    assert res_force.status_code == 200

    # Verify user modification (category Offer Letter) was preserved
    updated_doc = gmail_store.get_classification(user_id=user_id, gmail_message_id="msg-user-mod")
    assert updated_doc["category"] == "Offer Letter"
