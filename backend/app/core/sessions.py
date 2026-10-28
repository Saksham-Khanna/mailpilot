"""Development-only anonymous sessions and CSRF protection.

This is deliberately the smallest safe mechanism that lets OAuth credentials be
bound to one browser without building a fake production identity system:

* The server issues an opaque random user id inside an HMAC-signed, HttpOnly
  cookie. There is no login, password, email verification, or account recovery.
* The CSRF token is derived from the same secret and user id and is handed to the
  SPA. State-changing requests must send it in ``X-CSRF-Token``.
* Anyone who copies the cookie can act as that user. This is acceptable only for
  local/development use and MUST be replaced by real authentication before any
  real user data is exposed.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
import uuid
from dataclasses import dataclass

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

SESSION_COOKIE_NAME = "mailpilot_session"
CSRF_HEADER_NAME = "X-CSRF-Token"
SESSION_VERSION = 1


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class SessionSigner:
    """Issue and verify signed anonymous session cookies."""

    def __init__(self, secret: str, max_age_seconds: int):
        if not secret or len(secret) < 32:
            raise ValueError("session secret must contain at least 32 characters")
        self._secret = secret.encode("utf-8")
        self.max_age_seconds = max_age_seconds

    def _sign(self, payload: str) -> str:
        digest = hmac.new(self._secret, payload.encode("ascii"), hashlib.sha256).digest()
        return _b64e(digest)

    def issue(self, user_id: str, now: int | None = None) -> str:
        issued = int(time.time() if now is None else now)
        payload = _b64e(
            json.dumps(
                {"v": SESSION_VERSION, "uid": user_id, "iat": issued},
                separators=(",", ":"),
            ).encode("utf-8")
        )
        return f"{payload}.{self._sign(payload)}"

    def verify(self, token: str | None, now: int | None = None) -> str | None:
        """Return the user id for a valid, unexpired token, otherwise ``None``."""
        if not token or len(token) > 2048 or token.count(".") != 1:
            return None
        payload, signature = token.split(".", 1)
        try:
            expected = self._sign(payload)
        except (UnicodeEncodeError, ValueError):
            return None
        if not hmac.compare_digest(signature, expected):
            return None
        try:
            data = json.loads(_b64d(payload).decode("utf-8"))
            user_id = data["uid"]
            issued = int(data["iat"])
            version = data["v"]
            uuid.UUID(user_id)
        except (KeyError, TypeError, ValueError, UnicodeError, json.JSONDecodeError):
            return None
        current = int(time.time() if now is None else now)
        if version != SESSION_VERSION:
            return None
        # Reject future-dated cookies beyond a small clock skew and expired ones.
        if issued > current + 300 or current - issued > self.max_age_seconds:
            return None
        return user_id

    def csrf_for(self, user_id: str) -> str:
        digest = hmac.new(
            self._secret, f"csrf:{user_id}".encode("utf-8"), hashlib.sha256
        ).digest()
        return _b64e(digest)

    def verify_csrf(self, token: str | None, user_id: str) -> bool:
        if not token:
            return False
        return hmac.compare_digest(token, self.csrf_for(user_id))

    @staticmethod
    def new_user_id() -> str:
        return str(uuid.uuid4())


@dataclass(frozen=True)
class SessionConfig:
    signer: SessionSigner
    cookie_name: str = SESSION_COOKIE_NAME
    max_age_seconds: int = 1209600
    secure: bool = False
    samesite: str = "lax"


class SessionMiddleware(BaseHTTPMiddleware):
    """Attach a stable anonymous user id and CSRF token to every API request."""

    def __init__(self, app, config: SessionConfig):
        super().__init__(app)
        self.config = config

    async def dispatch(self, request: Request, call_next):
        # CORS preflight requests must not create sessions or cookies.
        if request.method == "OPTIONS":
            return await call_next(request)

        existing = request.cookies.get(self.config.cookie_name)
        user_id = self.config.signer.verify(existing)
        is_new = user_id is None
        if is_new:
            user_id = self.config.signer.new_user_id()

        request.state.user_id = user_id
        request.state.csrf_token = self.config.signer.csrf_for(user_id)

        response = await call_next(request)
        if is_new:
            response.set_cookie(
                key=self.config.cookie_name,
                value=self.config.signer.issue(user_id),
                max_age=self.config.max_age_seconds,
                httponly=True,
                secure=self.config.secure,
                samesite=self.config.samesite,
                path="/",
            )
        return response


def generate_secret() -> str:
    """Generate an ephemeral development session secret."""
    return secrets.token_urlsafe(48)
