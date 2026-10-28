from datetime import datetime, timedelta

import httplib2
import pytest
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.services.gmail_client import (
    GmailApiError,
    GmailAuthError,
    GmailClient,
    GmailProfileError,
    GmailRateLimitError,
    GmailUnavailableError,
)


def http_error(status: int, content: bytes = b"") -> HttpError:
    return HttpError(httplib2.Response({"status": status}), content)


class Request:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error

    def execute(self):
        if self.error is not None:
            raise self.error
        return self.result


class SequenceRequest:
    def __init__(self, items):
        self.items = list(items)
        self.calls = 0

    def execute(self):
        self.calls += 1
        item = self.items.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class FakeCredentials:
    def __init__(self, *, expired=False, refresh_token="refresh"):
        self.token = "access"
        self.refresh_token = refresh_token
        self.expired = expired
        self.expiry = None
        self.refresh_calls = 0
        self.fail_refresh = False

    def refresh(self, request):
        self.refresh_calls += 1
        if self.fail_refresh:
            raise RefreshError("refresh failed")
        self.token = "refreshed"
        self.expired = False
        self.expiry = datetime.utcnow() + timedelta(hours=1)


class FakeService:
    def __init__(self, *, profile=None, pages=None, message=None):
        self.profile = profile if profile is not None else {
            "emailAddress": "user@example.com",
            "historyId": "42",
        }
        self.pages = list(pages or [])
        self.message = message if message is not None else {}
        self.list_calls = []
        self.get_calls = []

    def users(self):
        return self

    def getProfile(self, **kwargs):
        return Request(self.profile)

    def messages(self):
        return self

    def list(self, **kwargs):
        self.list_calls.append(kwargs)
        return Request(self.pages.pop(0) if self.pages else {})

    def get(self, **kwargs):
        self.get_calls.append(kwargs)
        return Request(self.message)


def test_profile_identity():
    client = GmailClient(FakeCredentials(), service=FakeService())
    assert client.get_profile()["emailAddress"] == "user@example.com"


def test_missing_profile_email_is_rejected():
    service = FakeService(profile={})
    client = GmailClient(FakeCredentials(), service=service)
    with pytest.raises(GmailProfileError):
        client.get_profile()


def test_expired_token_refreshes_and_reports_new_token():
    credentials = FakeCredentials(expired=True)
    refreshed = []

    def on_refresh(token, expiry):
        refreshed.append((token, expiry))

    client = GmailClient(
        credentials, service=FakeService(), on_token_refresh=on_refresh
    )
    assert client.get_profile()["emailAddress"] == "user@example.com"
    assert credentials.refresh_calls == 1
    assert refreshed and refreshed[0][0] == "refreshed"


def test_refresh_failure_is_auth_error():
    credentials = FakeCredentials(expired=True)
    credentials.fail_refresh = True
    client = GmailClient(credentials, service=FakeService())
    with pytest.raises(GmailAuthError):
        client.get_profile()


def test_missing_refresh_token_is_auth_error():
    credentials = FakeCredentials(expired=True, refresh_token=None)
    client = GmailClient(credentials, service=FakeService())
    with pytest.raises(GmailAuthError):
        client.get_profile()


def test_401_refreshes_once_and_retries():
    credentials = FakeCredentials()
    service = FakeService()
    service.users = lambda: service
    request = SequenceRequest(
        [http_error(401), {"emailAddress": "user@example.com", "historyId": "1"}]
    )
    service.getProfile = lambda **kwargs: request
    client = GmailClient(credentials, service=service)
    assert client.get_profile()["emailAddress"] == "user@example.com"
    assert credentials.refresh_calls == 1
    assert request.calls == 2


def test_rate_limit_retries_with_retry_after():
    service = FakeService()
    request = SequenceRequest(
        [
            http_error(429, b"rateLimitExceeded"),
            {"emailAddress": "user@example.com", "historyId": "1"},
        ]
    )
    service.getProfile = lambda **kwargs: request
    sleeps = []
    client = GmailClient(
        FakeCredentials(),
        service=service,
        sleep=sleeps.append,
        max_retries=2,
    )
    assert client.get_profile()["emailAddress"] == "user@example.com"
    assert request.calls == 2
    assert sleeps == [0.5]


def test_rate_limit_honors_retry_after_header():
    service = FakeService()
    response = httplib2.Response({"status": 429, "retry-after": "1"})
    request = SequenceRequest(
        [
            HttpError(response, b"rateLimitExceeded"),
            {"emailAddress": "user@example.com", "historyId": "1"},
        ]
    )
    service.getProfile = lambda **kwargs: request
    sleeps = []
    client = GmailClient(FakeCredentials(), service=service, sleep=sleeps.append)
    client.get_profile()
    assert sleeps == [1.0]


def test_transient_failure_exhausts_retries():
    service = FakeService()
    request = SequenceRequest([http_error(503), http_error(503), http_error(503)])
    service.getProfile = lambda **kwargs: request
    client = GmailClient(
        FakeCredentials(), service=service, sleep=lambda _: None, max_retries=2
    )
    with pytest.raises(GmailUnavailableError):
        client.get_profile()
    assert request.calls == 3


def test_403_quota_is_rate_limit_and_not_retried():
    service = FakeService()
    request = SequenceRequest([http_error(403, b"userRateLimitExceeded")])
    service.getProfile = lambda **kwargs: request
    client = GmailClient(FakeCredentials(), service=service)
    with pytest.raises(GmailRateLimitError):
        client.get_profile()
    assert request.calls == 1


def test_400_becomes_api_error():
    service = FakeService()
    request = SequenceRequest([http_error(400)])
    service.getProfile = lambda **kwargs: request
    client = GmailClient(FakeCredentials(), service=service)
    with pytest.raises(GmailApiError):
        client.get_profile()


def test_pagination_respects_limit_and_page_size():
    service = FakeService(
        pages=[
            {"messages": [{"id": "1"}], "nextPageToken": "page-2"},
            {"messages": [{"id": "2"}], "nextPageToken": "page-3"},
            {"messages": [{"id": "3"}]},
        ]
    )
    client = GmailClient(FakeCredentials(), service=service)
    ids = client.list_recent_inbox_message_ids(2)
    assert ids == ["1", "2"]
    assert [call["maxResults"] for call in service.list_calls] == [2, 1]
    assert service.list_calls[0]["labelIds"] == ["INBOX"]
    assert service.list_calls[0]["userId"] == "me"
    assert "pageToken" not in service.list_calls[0]
    assert service.list_calls[1]["pageToken"] == "page-2"


def test_pagination_stops_when_no_next_token():
    service = FakeService(pages=[{"messages": [{"id": "1"}]}])
    client = GmailClient(FakeCredentials(), service=service)
    assert client.list_recent_inbox_message_ids(5) == ["1"]
    assert len(service.list_calls) == 1


def test_pagination_limit_validation():
    client = GmailClient(FakeCredentials(), service=FakeService())
    for value in (0, -1, 51, "10"):
        with pytest.raises(ValueError):
            client.list_recent_inbox_message_ids(value)


def test_get_message_uses_full_format_and_validates_id():
    service = FakeService(message={"id": "m1"})
    client = GmailClient(FakeCredentials(), service=service)
    assert client.get_message("m1")["id"] == "m1"
    assert service.get_calls == [{"userId": "me", "id": "m1", "format": "full"}]
    with pytest.raises(GmailApiError):
        client.get_message("")
    with pytest.raises(GmailApiError):
        client.get_message("x" * 201)
