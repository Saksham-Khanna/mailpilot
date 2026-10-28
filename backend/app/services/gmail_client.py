"""Minimal Gmail API client with bounded reads, retries and token refresh.

The client never exposes tokens. Refreshed access tokens are handed to a
callback so the caller can re-encrypt and persist them.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any

import httplib2
from google.auth.exceptions import RefreshError, TransportError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google_auth_httplib2 import AuthorizedHttp

logger = logging.getLogger(__name__)

TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}
MAX_MESSAGE_ID_LENGTH = 200


class GmailError(RuntimeError):
    code = "gmail_error"

    def __init__(self, code: str | None = None):
        self.code = code or self.code
        super().__init__(self.code)


class GmailAuthError(GmailError):
    code = "reauth_required"


class GmailRateLimitError(GmailError):
    code = "gmail_rate_limited"


class GmailUnavailableError(GmailError):
    code = "gmail_unavailable"


class GmailApiError(GmailError):
    code = "gmail_api_error"


class GmailProfileError(GmailError):
    code = "gmail_profile_invalid"


TokenRefreshCallback = Callable[[str, Any], None]


def build_gmail_service(credentials: Credentials, *, timeout_seconds: int = 20):
    """Build a Gmail service. Static discovery avoids a network fetch at import."""
    http = AuthorizedHttp(
        credentials,
        http=httplib2.Http(timeout=timeout_seconds),
        # We handle 401 ourselves so a refreshed token can be persisted.
        refresh_status_codes=(),
    )
    return build(
        "gmail",
        "v1",
        http=http,
        cache_discovery=False,
        static_discovery=True,
    )


class GmailClient:
    """Read-only Gmail operations used by the current phase."""

    def __init__(
        self,
        credentials: Credentials,
        *,
        on_token_refresh: TokenRefreshCallback | None = None,
        service: Any | None = None,
        request_factory: Callable[[], Any] = Request,
        sleep: Callable[[float], None] = time.sleep,
        max_retries: int = 2,
        timeout_seconds: int = 20,
    ):
        self.credentials = credentials
        self._on_token_refresh = on_token_refresh
        self._service = service
        self._request_factory = request_factory
        self._sleep = sleep
        self._max_retries = max_retries
        self._timeout_seconds = timeout_seconds

    # ------------------------------------------------------------------ setup

    def _ensure_service(self) -> Any:
        if self.credentials.expired:
            if not self.credentials.refresh_token:
                raise GmailAuthError()
            self._refresh()
        if self._service is None:
            self._service = build_gmail_service(
                self.credentials, timeout_seconds=self._timeout_seconds
            )
        return self._service

    def _refresh(self) -> None:
        if not self.credentials.refresh_token:
            raise GmailAuthError()
        try:
            self.credentials.refresh(self._request_factory())
        except RefreshError:
            raise GmailAuthError() from None
        except Exception as exc:  # noqa: BLE001 - network/library errors become reauth
            logger.warning("Gmail token refresh failed: %s", type(exc).__name__)
            raise GmailAuthError() from None
        if not self.credentials.token:
            raise GmailAuthError()
        if self._on_token_refresh is not None:
            try:
                self._on_token_refresh(self.credentials.token, self.credentials.expiry)
            except Exception as exc:  # noqa: BLE001 - do not fail a valid sync on cache write
                logger.warning("Could not persist refreshed Gmail token: %s", type(exc).__name__)

    # --------------------------------------------------------------- execution

    @staticmethod
    def _retry_after(exc: HttpError) -> float | None:
        try:
            raw = exc.resp.get("retry-after")
            if raw is None:
                return None
            value = float(raw)
            return min(max(value, 0.0), 5.0)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _status(exc: HttpError) -> int:
        try:
            return int(exc.resp.status)
        except (AttributeError, TypeError, ValueError):
            return 0

    @staticmethod
    def _mapped_error(status: int, exc: HttpError) -> GmailError:
        if status == 401:
            return GmailAuthError()
        if status == 403:
            # 403 is used both for missing scopes and quota exhaustion.
            content = exc.content or b""
            if b"rateLimitExceeded" in content or b"userRateLimitExceeded" in content:
                return GmailRateLimitError()
            return GmailApiError("gmail_forbidden")
        if status == 429:
            return GmailRateLimitError()
        if status >= 500:
            return GmailUnavailableError()
        return GmailApiError()

    def _execute(self, request: Any) -> dict[str, Any]:
        self._ensure_service()
        can_refresh = True
        for attempt in range(self._max_retries + 1):
            try:
                result = request.execute()
                if not isinstance(result, dict):
                    raise GmailApiError("gmail_invalid_response")
                return result
            except HttpError as exc:
                status = self._status(exc)
                if status == 401 and can_refresh:
                    self._refresh()
                    can_refresh = False
                    continue
                if status in TRANSIENT_STATUS_CODES and attempt < self._max_retries:
                    delay = self._retry_after(exc)
                    if delay is None:
                        delay = 0.5 * (2**attempt)
                    self._sleep(delay)
                    continue
                raise self._mapped_error(status, exc) from None
            except (httplib2.HttpLib2Error, TransportError, OSError, TimeoutError) as exc:
                if attempt < self._max_retries:
                    self._sleep(0.5 * (2**attempt))
                    continue
                logger.warning("Gmail transport failure: %s", type(exc).__name__)
                raise GmailUnavailableError() from None
        raise GmailUnavailableError()

    # ------------------------------------------------------------------- reads

    def get_profile(self) -> dict[str, Any]:
        service = self._ensure_service()
        result = self._execute(service.users().getProfile(userId="me"))
        email = result.get("emailAddress")
        if not isinstance(email, str) or not email.strip():
            raise GmailProfileError()
        return result

    def list_recent_inbox_message_ids(self, limit: int) -> list[str]:
        """List at most ``limit`` recent inbox ids, following bounded pagination."""
        if not isinstance(limit, int) or not 1 <= limit <= 50:
            raise ValueError("limit must be between 1 and 50")
        service = self._ensure_service()
        ids: list[str] = []
        page_token: str | None = None
        seen_tokens: set[str] = set()
        while len(ids) < limit:
            page_size = min(100, limit - len(ids))
            params: dict[str, Any] = {
                "userId": "me",
                "labelIds": ["INBOX"],
                "maxResults": page_size,
            }
            if page_token:
                params["pageToken"] = page_token
            result = self._execute(service.users().messages().list(**params))
            for item in result.get("messages") or []:
                if not isinstance(item, dict):
                    continue
                message_id = item.get("id")
                if (
                    isinstance(message_id, str)
                    and message_id
                    and len(message_id) <= MAX_MESSAGE_ID_LENGTH
                ):
                    ids.append(message_id)
                    if len(ids) >= limit:
                        break
            next_token = result.get("nextPageToken")
            if not isinstance(next_token, str) or not next_token:
                break
            if next_token in seen_tokens:
                break
            seen_tokens.add(next_token)
            page_token = next_token
        return ids[:limit]

    def get_message(self, message_id: str) -> dict[str, Any]:
        if (
            not isinstance(message_id, str)
            or not message_id
            or len(message_id) > MAX_MESSAGE_ID_LENGTH
        ):
            raise GmailApiError("gmail_invalid_message_id")
        service = self._ensure_service()
        return self._execute(
            service.users().messages().get(userId="me", id=message_id, format="full")
        )
