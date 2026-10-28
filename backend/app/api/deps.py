"""FastAPI dependencies for sessions, CSRF, database and encryption."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from pymongo.errors import PyMongoError

from app.core.crypto import TokenCipher
from app.core.sessions import CSRF_HEADER_NAME
from app.db.gmail_store import GmailStore, StoreUnavailable


def get_current_user(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        # The session middleware should always set this, but fail closed.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A browser session is required.",
        )
    return user_id


def require_csrf(
    request: Request, user_id: str = Depends(get_current_user)
) -> None:
    """Double-check the session-bound CSRF token for state-changing routes."""
    signer = getattr(request.app.state, "session_signer", None)
    token = request.headers.get(CSRF_HEADER_NAME)
    if signer is None or not signer.verify_csrf(token, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed.",
        )


def get_gmail_store(request: Request) -> GmailStore:
    store = getattr(request.app.state, "gmail_store", None)
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable.",
        )
    try:
        store.ensure_indexes()
    except (StoreUnavailable, PyMongoError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable.",
        ) from None
    return store


def get_token_cipher(request: Request) -> TokenCipher:
    cipher = getattr(request.app.state, "token_cipher", None)
    if cipher is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Credential encryption is not configured.",
        )
    return cipher


def get_optional_cipher(request: Request) -> TokenCipher | None:
    """Encryption may be unavailable during disconnect; local deletion still works."""
    return getattr(request.app.state, "token_cipher", None)


def get_gmail_client_factory(request: Request):
    factory = getattr(request.app.state, "gmail_client_factory", None)
    if factory is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gmail integration is unavailable.",
        )
    return factory
