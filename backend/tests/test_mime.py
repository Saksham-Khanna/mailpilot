import base64
from datetime import datetime, timezone

import pytest

from app.services.mime import EmailParseError, MAX_BODY_CHARS, normalize_gmail_message


def b64(text: str, encoding: str = "utf-8") -> str:
    return base64.urlsafe_b64encode(text.encode(encoding)).decode("ascii").rstrip("=")


def plain_message(body: str = "Hello world", **overrides):
    message = {
        "id": "msg-1",
        "threadId": "thread-1",
        "snippet": "  Hello  ",
        "internalDate": "1700000000000",
        "labelIds": ["INBOX", "UNREAD"],
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": "Alice Example <Alice@Example.COM>"},
                {"name": "To", "value": "me@example.com"},
                {"name": "Subject", "value": "A subject"},
                {"name": "Date", "value": "Tue, 14 Nov 2023 22:13:20 +0000"},
            ],
            "body": {"data": b64(body)},
        },
    }
    message.update(overrides)
    return message


def test_plain_text_message_and_headers():
    result = normalize_gmail_message(plain_message())
    assert result.gmail_message_id == "msg-1"
    assert result.gmail_thread_id == "thread-1"
    assert result.sender_name == "Alice Example"
    assert result.sender_email == "alice@example.com"
    assert result.recipient == "me@example.com"
    assert result.subject == "A subject"
    assert result.body_text == "Hello world"
    assert result.body_source == "text/plain"
    assert result.has_body is True
    assert result.labels == ["INBOX", "UNREAD"]
    assert result.received_at == datetime(2023, 11, 14, 22, 13, 20, tzinfo=timezone.utc)


def test_multipart_prefers_plain_text():
    message = plain_message()
    message["payload"] = {
        "mimeType": "multipart/alternative",
        "headers": [],
        "parts": [
            {
                "mimeType": "text/plain",
                "headers": [],
                "body": {"data": b64("plain version")},
            },
            {
                "mimeType": "text/html",
                "headers": [],
                "body": {"data": b64("<p>html version</p>")},
            },
        ],
    }
    result = normalize_gmail_message(message)
    assert result.body_text == "plain version"
    assert result.body_source == "text/plain"


def test_html_only_is_converted_to_safe_text():
    html = """
    <html><head><style>.x{color:red}</style><script>alert('owned')</script></head>
    <body><p>Hello &amp; welcome</p><div>Second line</div>
    <img src="https://tracker.example/pixel.gif"><a href="https://evil.example">link</a>
    <script>steal()</script></body></html>
    """
    message = plain_message()
    message["payload"] = {
        "mimeType": "text/html",
        "headers": [],
        "body": {"data": b64(html)},
    }
    result = normalize_gmail_message(message)
    assert result.body_source == "html-derived"
    assert "Hello & welcome" in result.body_text
    assert "Second line" in result.body_text
    assert "owned" not in result.body_text
    assert "steal" not in result.body_text
    assert "tracker.example" not in result.body_text
    assert "<p>" not in result.body_text


def test_charset_and_unpadded_base64url_are_decoded():
    message = plain_message()
    raw = "café".encode("iso-8859-1")
    data = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    message["payload"] = {
        "mimeType": "text/plain",
        "headers": [{"name": "Content-Type", "value": 'text/plain; charset="iso-8859-1"'}],
        "body": {"data": data},
    }
    assert normalize_gmail_message(message).body_text == "café"


def test_encoded_headers_are_decoded_and_control_characters_removed():
    message = plain_message()
    message["payload"]["headers"] = [
        {"name": "From", "value": "=?UTF-8?B?QWxpY2UgRXhhbXBsZQ==?= <alice@example.com>"},
        {"name": "To", "value": "me@example.com"},
        {"name": "Subject", "value": "=?UTF-8?B?SGVsbG8gV29ybGQ=?=\r\nBcc: evil@example.com"},
    ]
    result = normalize_gmail_message(message)
    assert result.sender_name == "Alice Example"
    assert result.subject == "Hello WorldBcc: evil@example.com"


def test_date_header_fallback_when_internal_date_missing():
    message = plain_message()
    message.pop("internalDate")
    message["payload"]["headers"].append(
        {"name": "Date", "value": "Tue, 14 Nov 2023 22:13:20 +0000"}
    )
    result = normalize_gmail_message(message)
    assert result.received_at.year == 2023


def test_malformed_base64_yields_empty_body():
    message = plain_message()
    message["payload"]["body"]["data"] = "!!!not-base64!!!"
    result = normalize_gmail_message(message)
    assert result.body_text == ""
    assert result.has_body is False
    assert result.body_source == "none"


def test_missing_identity_is_rejected():
    message = plain_message()
    message.pop("threadId")
    with pytest.raises(EmailParseError):
        normalize_gmail_message(message)


def test_body_is_bounded():
    result = normalize_gmail_message(plain_message("x" * (MAX_BODY_CHARS + 500)))
    assert len(result.body_text) == MAX_BODY_CHARS


def test_missing_body_is_allowed():
    message = plain_message()
    message["payload"]["body"] = {}
    result = normalize_gmail_message(message)
    assert result.body_text == ""
    assert result.body_source == "none"
