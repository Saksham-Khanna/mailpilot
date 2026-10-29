"""Google OAuth 2.0 authorization-code flow helpers.

Only the official Google libraries are used. No token is ever returned to the
frontend: callbacks redirect with a status code only, and tokens are encrypted
before persistence.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from google_auth_oauthlib.flow import Flow

from app.core.config import Settings

AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
# Reading inbox messages and identifying the authenticated account only.
# No gmail.send / gmail.modify / mail.google.com scopes are requested.
GMAIL_SCOPES = ("openid", "email", GMAIL_READONLY_SCOPE)


class OAuthConfigurationError(RuntimeError):
    """The Google OAuth client is not configured."""


class OAuthExchangeError(RuntimeError):
    """The authorization code could not be exchanged or was insufficient."""


@dataclass(frozen=True)
class OAuthTokens:
    access_token: str
    refresh_token: str
    expiry: datetime | None
    scopes: tuple[str, ...]
    token_uri: str = TOKEN_URI


def new_state() -> str:
    return secrets.token_urlsafe(32)


def _client_config(settings: Settings) -> dict:
    if not settings.gmail_oauth_configured:
        raise OAuthConfigurationError("Google OAuth is not configured")
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": AUTH_URI,
            "token_uri": TOKEN_URI,
            "redirect_uris": [settings.google_redirect_uri],
        }
    }


def create_authorization_request(settings: Settings, state: str) -> tuple[str, str]:
    """Return ``(authorization_url, pkce_code_verifier)``.

    PKCE supplements the client secret. The verifier is short-lived, bound to the
    state document and encrypted at rest.
    """
    flow = Flow.from_client_config(
        _client_config(settings),
        scopes=list(GMAIL_SCOPES),
        redirect_uri=settings.google_redirect_uri,
        state=state,
        autogenerate_code_verifier=True,
    )
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    if not flow.code_verifier:
        raise OAuthConfigurationError("Could not create a PKCE verifier")
    return url, flow.code_verifier


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def exchange_code(settings: Settings, code: str, code_verifier: str) -> OAuthTokens:
    """Exchange an authorization code, validating that the required scope exists."""
    flow = Flow.from_client_config(
        _client_config(settings),
        scopes=list(GMAIL_SCOPES),
        redirect_uri=settings.google_redirect_uri,
        state=None,
        code_verifier=code_verifier,
        autogenerate_code_verifier=False,
    )
    try:
        flow.fetch_token(code=code)
    except Exception as exc:  # noqa: BLE001 - library raises several request/OAuth errors
        import logging
        logging.getLogger(__name__).error("OAuth exchange failed with error: %s", exc)
        # Do not echo the library message: it can include request details.
        raise OAuthExchangeError("Google rejected the authorization code") from exc

    credentials = flow.credentials
    access_token = credentials.token
    refresh_token = credentials.refresh_token
    if not access_token:
        raise OAuthExchangeError("Google did not return an access token")
    if not refresh_token:
        raise OAuthExchangeError("Google did not return a refresh token")

    granted = tuple(credentials.scopes or ())
    if GMAIL_READONLY_SCOPE not in granted:
        raise OAuthExchangeError("The Gmail read-only permission was not granted")

    return OAuthTokens(
        access_token=access_token,
        refresh_token=refresh_token,
        expiry=_as_utc(credentials.expiry),
        scopes=granted,
        token_uri=credentials.token_uri or TOKEN_URI,
    )
