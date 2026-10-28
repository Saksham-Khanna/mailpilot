"""Service layer for Gmail connection, synchronization and disconnection."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

import requests
from google.oauth2.credentials import Credentials

from app.core.config import Settings
from app.core.crypto import EncryptionError, TokenCipher
from app.db.gmail_store import GmailStore
from app.services import google_oauth
from app.services.gmail_client import (
    GmailApiError,
    GmailAuthError,
    GmailClient,
    GmailError,
    GmailProfileError,
    GmailRateLimitError,
    GmailUnavailableError,
)
from app.services.mime import EmailParseError, normalize_gmail_message

logger = logging.getLogger(__name__)

GMAIL_PROFILE_URI = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
REVOKE_URI = "https://oauth2.googleapis.com/revoke"
MAX_ERROR_CODE_LENGTH = 200

ClientFactory = Callable[..., Any]


class GmailNotConnected(RuntimeError):
    code = "gmail_not_connected"


class GmailCredentialError(RuntimeError):
    code = "gmail_credentials_invalid"


@dataclass(frozen=True)
class SyncResult:
    google_email: str
    considered: int
    new_messages: int
    updated_messages: int
    total_stored: int
    synced_at: datetime
    history_id: str | None


@dataclass(frozen=True)
class DisconnectResult:
    revoked: bool
    deleted_messages: int
    deleted_credentials: int


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _as_google_expiry(value: datetime | None) -> datetime | None:
    """google-auth compares against naive UTC datetimes."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _build_credentials(
    settings: Settings, credential_document: dict[str, Any], cipher: TokenCipher
) -> Credentials:
    try:
        access_token = cipher.decrypt(credential_document["encrypted_access_token"])
        refresh_token = cipher.decrypt(credential_document["encrypted_refresh_token"])
    except (KeyError, TypeError, EncryptionError):
        raise GmailCredentialError() from None

    scopes = credential_document.get("scopes") or list(google_oauth.GMAIL_SCOPES)
    return Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri=credential_document.get("token_uri") or google_oauth.TOKEN_URI,
        client_id=settings.google_client_id or None,
        client_secret=settings.google_client_secret or None,
        scopes=scopes,
        expiry=_as_google_expiry(_as_aware(credential_document.get("access_token_expires_at"))),
    )


def complete_connection(
    *,
    store: GmailStore,
    cipher: TokenCipher,
    settings: Settings,
    user_id: str,
    code: str,
    code_verifier: str,
    client_factory: ClientFactory = GmailClient,
) -> str:
    """Exchange a code, verify the Gmail identity, then persist encrypted tokens."""
    tokens = google_oauth.exchange_code(settings, code, code_verifier)

    credentials = Credentials(
        token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_uri=tokens.token_uri,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=list(tokens.scopes),
        expiry=_as_google_expiry(tokens.expiry),
    )

    def persist_refresh(access_token: str, expiry: Any) -> None:
        if not cipher:
            return
        store.update_access_token(
            user_id=user_id,
            encrypted_access_token=cipher.encrypt(access_token),
            access_token_expires_at=_as_aware(expiry),
        )

    client = client_factory(credentials, on_token_refresh=persist_refresh)
    profile = client.get_profile()
    google_email = str(profile.get("emailAddress") or "").strip().lower()
    if not google_email:
        raise GmailProfileError()

    existing = store.get_connection(user_id)
    if (
        existing
        and existing.get("google_email")
        and str(existing["google_email"]).lower() != google_email
    ):
        # Reconnecting a different Google account must not mix two mailboxes.
        store.delete_user_data(user_id)

    history_id = profile.get("historyId")
    store.upsert_credentials(
        user_id=user_id,
        encrypted_access_token=cipher.encrypt(tokens.access_token),
        encrypted_refresh_token=cipher.encrypt(tokens.refresh_token),
        access_token_expires_at=tokens.expiry,
        scopes=list(tokens.scopes),
        token_uri=tokens.token_uri,
    )
    store.upsert_connection(
        user_id=user_id,
        google_email=google_email,
        scopes=list(tokens.scopes),
        history_id=str(history_id) if history_id is not None else None,
    )
    return google_email


def sync_inbox(
    *,
    store: GmailStore,
    cipher: TokenCipher,
    settings: Settings,
    user_id: str,
    limit: int | None = None,
    client_factory: ClientFactory = GmailClient,
) -> SyncResult:
    """Synchronize a bounded batch of recent inbox messages.

    Repeated syncs upsert by ``(user_id, gmail_message_id)``; no duplicates.
    """
    if not settings.gmail_oauth_configured:
        raise GmailCredentialError("gmail_oauth_not_configured")
    connection = store.get_connection(user_id)
    credential_document = store.get_credentials(user_id)
    if connection is None or credential_document is None:
        raise GmailNotConnected()

    batch_size = settings.gmail_sync_batch_size if limit is None else limit
    if not isinstance(batch_size, int) or not 1 <= batch_size <= 50:
        raise ValueError("limit must be between 1 and 50")

    credentials = _build_credentials(settings, credential_document, cipher)

    def persist_refresh(access_token: str, expiry: Any) -> None:
        store.update_access_token(
            user_id=user_id,
            encrypted_access_token=cipher.encrypt(access_token),
            access_token_expires_at=_as_aware(expiry),
        )

    client = client_factory(credentials, on_token_refresh=persist_refresh)
    synced_at = _utcnow()

    try:
        profile = client.get_profile()
        google_email = str(profile.get("emailAddress") or "").strip().lower()
        if not google_email:
            raise GmailProfileError()
        stored_email = str(connection.get("google_email") or "").strip().lower()
        if stored_email and stored_email != google_email:
            raise GmailApiError("gmail_account_mismatch")
        history_id = profile.get("historyId")
        history_text = str(history_id) if history_id is not None else None

        message_ids = client.list_recent_inbox_message_ids(batch_size)
        documents: list[dict[str, Any]] = []
        for message_id in message_ids:
            try:
                raw = client.get_message(message_id)
                documents.append(normalize_gmail_message(raw).to_document())
            except EmailParseError:
                # One malformed message must not discard the rest of the batch.
                logger.warning("Skipped a Gmail message that could not be parsed")

        new_messages, updated_messages = store.upsert_messages(
            user_id=user_id, messages=documents, synced_at=synced_at
        )
        total_stored = store.count_messages(user_id)
        store.record_sync(
            user_id=user_id,
            status="ok",
            synced_at=synced_at,
            messages_synced=len(documents),
            history_id=history_text,
            error=None,
        )
        return SyncResult(
            google_email=google_email,
            considered=len(message_ids),
            new_messages=new_messages,
            updated_messages=updated_messages,
            total_stored=total_stored,
            synced_at=synced_at,
            history_id=history_text,
        )
    except GmailAuthError:
        store.mark_needs_reconnect(user_id)
        _record_failure(store, user_id, synced_at, GmailAuthError.code)
        raise
    except (GmailError, GmailCredentialError, EncryptionError) as exc:
        _record_failure(store, user_id, synced_at, getattr(exc, "code", "gmail_error"))
        raise
    except Exception as exc:  # noqa: BLE001 - record a safe code then re-raise
        _record_failure(store, user_id, synced_at, "internal_error")
        logger.warning("Gmail sync failed: %s", type(exc).__name__)
        raise


def _record_failure(
    store: GmailStore, user_id: str, synced_at: datetime, code: str
) -> None:
    try:
        store.record_sync(
            user_id=user_id,
            status="error",
            synced_at=synced_at,
            messages_synced=0,
            error=code[:MAX_ERROR_CODE_LENGTH],
        )
    except Exception as exc:  # noqa: BLE001 - never mask the original sync error
        logger.warning("Could not record Gmail sync failure: %s", type(exc).__name__)


def disconnect_account(
    *, store: GmailStore, cipher: TokenCipher | None, user_id: str
) -> DisconnectResult:
    """Best-effort revoke at Google, then delete every local artifact.

    A missing encryption key must not block local deletion: if the ciphertext
    cannot be opened, we still remove all stored credentials and messages.
    """
    credential_document = store.get_credentials(user_id)
    connection = store.get_connection(user_id)
    if credential_document is None and connection is None:
        raise GmailNotConnected()

    revoked = False
    token_to_revoke = None
    if credential_document is not None and cipher is not None:
        try:
            token_to_revoke = cipher.decrypt(
                credential_document.get("encrypted_refresh_token", "")
            )
        except (EncryptionError, AttributeError, TypeError):
            # Corrupt/undecryptable credentials are still deleted locally.
            token_to_revoke = None

    if token_to_revoke:
        try:
            response = requests.post(
                REVOKE_URI,
                data={"token": token_to_revoke},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
            )
            revoked = response.status_code == 200
        except requests.RequestException as exc:
            logger.warning("Gmail token revocation failed: %s", type(exc).__name__)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gmail token revocation failed: %s", type(exc).__name__)

    deleted = store.delete_user_data(user_id)
    return DisconnectResult(
        revoked=revoked,
        deleted_messages=deleted["messages"],
        deleted_credentials=deleted["credentials"],
    )
