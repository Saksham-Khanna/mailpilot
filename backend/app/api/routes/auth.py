"""Session bootstrap and Google OAuth 2.0 routes."""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.api.deps import (
    get_current_user,
    get_gmail_client_factory,
    get_gmail_store,
    get_token_cipher,
)
from app.core.config import get_settings
from app.schemas.gmail import SessionInfo
from app.services import google_oauth
from app.services.gmail_client import GmailError
from app.services.gmail_sync import complete_connection

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])

_SAFE_REASON = re.compile(r"^[a-z0-9_]{1,40}$")


def _safe_reason(value: str | None, fallback: str = "oauth_error") -> str:
    if value and _SAFE_REASON.fullmatch(value):
        return value
    return fallback


def _frontend_redirect(settings, *, gmail: str, reason: str | None = None) -> str:
    origin = settings.frontend_origins[0]
    params = {"gmail": gmail}
    if reason:
        params["reason"] = reason
    return f"{origin}/?{urlencode(params)}#/inbox"


def _error_redirect(settings, reason: str) -> RedirectResponse:
    return RedirectResponse(
        _frontend_redirect(settings, gmail="error", reason=reason),
        status_code=status.HTTP_302_FOUND,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/session", response_model=SessionInfo)
def session_info(
    request: Request,
    response: Response,
    user_id: str = Depends(get_current_user),
) -> SessionInfo:
    """Return the CSRF token for this browser session. No identity is exposed."""
    del user_id
    settings = get_settings()
    response.headers["Cache-Control"] = "no-store"
    return SessionInfo(
        csrf_token=request.state.csrf_token,
        expires_in=settings.session_max_age_seconds,
    )


@router.get("/google/start")
def google_start(
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
    cipher=Depends(get_token_cipher),
) -> RedirectResponse:
    """Create a single-use OAuth state bound to this session and redirect to Google."""
    settings = get_settings()
    if not settings.gmail_oauth_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server.",
        )

    raw_state = google_oauth.new_state()
    try:
        authorization_url, code_verifier = google_oauth.create_authorization_request(
            settings, raw_state
        )
    except google_oauth.OAuthConfigurationError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server.",
        ) from None

    state_hash = hashlib.sha256(raw_state.encode("utf-8")).hexdigest()
    expires_at = datetime.now(tz=timezone.utc) + timedelta(
        seconds=settings.oauth_state_ttl_seconds
    )
    try:
        store.create_oauth_state(
            state_hash=state_hash,
            user_id=user_id,
            encrypted_code_verifier=cipher.encrypt(code_verifier),
            expires_at=expires_at,
        )
    except Exception as exc:  # noqa: BLE001 - Mongo errors become a safe 503
        logger.warning("Could not store OAuth state: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not start Gmail authorization.",
        ) from None

    return RedirectResponse(
        authorization_url,
        status_code=status.HTTP_302_FOUND,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
    cipher=Depends(get_token_cipher),
    client_factory=Depends(get_gmail_client_factory),
):
    """Validate state before exchanging the code, then store encrypted credentials."""
    del request, error_description
    settings = get_settings()

    if error:
        # Consume a matching state when present so a denied flow cannot be replayed.
        if state and 10 <= len(state) <= 512:
            state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()
            try:
                store.consume_oauth_state(state_hash=state_hash, user_id=user_id)
            except Exception as exc:  # noqa: BLE001 - redirect regardless
                logger.warning("Could not consume OAuth state: %s", type(exc).__name__)
        return _error_redirect(settings, _safe_reason(error))

    if not code or not state:
        return _error_redirect(settings, "invalid_callback")
    if not 10 <= len(state) <= 512 or len(code) > 4096:
        return _error_redirect(settings, "invalid_state")

    state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()
    try:
        state_document = store.consume_oauth_state(
            state_hash=state_hash, user_id=user_id
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not consume OAuth state: %s", type(exc).__name__)
        return _error_redirect(settings, "server_error")
    if state_document is None:
        # Unknown, expired, already used, or bound to another session.
        return _error_redirect(settings, "invalid_state")

    try:
        code_verifier = cipher.decrypt(state_document["encrypted_code_verifier"])
    except Exception:  # noqa: BLE001 - never leak decryption details
        return _error_redirect(settings, "server_error")

    try:
        complete_connection(
            store=store,
            cipher=cipher,
            settings=settings,
            user_id=user_id,
            code=code,
            code_verifier=code_verifier,
            client_factory=client_factory,
        )
    except google_oauth.OAuthConfigurationError:
        return _error_redirect(settings, "oauth_not_configured")
    except google_oauth.OAuthExchangeError:
        return _error_redirect(settings, "exchange_failed")
    except GmailError:
        return _error_redirect(settings, "gmail_connection_failed")
    except Exception as exc:  # noqa: BLE001 - safe reason only; log type only
        logger.warning("Gmail connection failed: %s", type(exc).__name__)
        return _error_redirect(settings, "connection_failed")

    return RedirectResponse(
        _frontend_redirect(settings, gmail="connected"),
        status_code=status.HTTP_302_FOUND,
        headers={"Cache-Control": "no-store"},
    )
