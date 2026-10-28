"""Gmail status, synchronization, message and disconnect routes."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pymongo.errors import PyMongoError

from app.api.deps import (
    get_current_user,
    get_gmail_client_factory,
    get_gmail_store,
    get_optional_cipher,
    get_token_cipher,
    require_csrf,
)
from app.core.config import get_settings
from app.core.crypto import EncryptionError
from app.schemas.gmail import (
    DisconnectResponse,
    GmailStatus,
    MessageDetail,
    MessageList,
    MessageSummary,
    SyncResponse,
)
from app.services.gmail_client import (
    GmailApiError,
    GmailAuthError,
    GmailError,
    GmailProfileError,
    GmailRateLimitError,
    GmailUnavailableError,
)
from app.services.gmail_sync import (
    GmailCredentialError,
    GmailNotConnected,
    disconnect_account,
    sync_inbox,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["gmail"])

_MESSAGE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,200}$")


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _summary(document: dict) -> MessageSummary:
    return MessageSummary(
        id=str(document["gmail_message_id"]),
        thread_id=str(document.get("gmail_thread_id") or ""),
        sender_name=str(document.get("sender_name") or ""),
        sender_email=str(document.get("sender_email") or ""),
        recipient=str(document.get("recipient") or ""),
        subject=str(document.get("subject") or ""),
        received_at=_aware(document.get("received_at")),
        snippet=str(document.get("snippet") or ""),
        labels=list(document.get("labels") or []),
        synced_at=_aware(document.get("synced_at")),
        has_body=bool(document.get("has_body")),
    )


def _detail(document: dict) -> MessageDetail:
    base = _summary(document)
    return MessageDetail(
        **base.model_dump(),
        body_text=str(document.get("body_text") or ""),
        body_source=str(document.get("body_source") or "none"),
    )


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


@router.get("/status", response_model=GmailStatus)
def gmail_status(
    response: Response,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> GmailStatus:
    _no_store(response)
    connection = store.get_connection(user_id)
    if connection is None:
        return GmailStatus(connected=False)
    return GmailStatus(
        connected=True,
        google_email=connection.get("google_email"),
        connected_at=_aware(connection.get("connected_at")),
        last_sync_at=_aware(connection.get("last_sync_at")),
        last_sync_status=connection.get("last_sync_status"),
        last_error=connection.get("last_error"),
        needs_reconnect=bool(connection.get("needs_reconnect")),
        message_count=store.count_messages(user_id),
    )


@router.post(
    "/sync",
    response_model=SyncResponse,
    dependencies=[Depends(require_csrf)],
)
def gmail_sync(
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=50),
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
    cipher=Depends(get_token_cipher),
    client_factory=Depends(get_gmail_client_factory),
) -> SyncResponse:
    _no_store(response)
    settings = get_settings()
    try:
        result = sync_inbox(
            store=store,
            cipher=cipher,
            settings=settings,
            user_id=user_id,
            limit=limit,
            client_factory=client_factory,
        )
    except GmailNotConnected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Gmail is not connected.",
        ) from None
    except GmailAuthError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Gmail authorization expired. Reconnect Gmail.",
        ) from None
    except GmailRateLimitError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gmail rate limit reached. Try again shortly.",
            headers={"Retry-After": "5"},
        ) from None
    except GmailUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gmail is temporarily unavailable.",
        ) from None
    except GmailProfileError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not verify the Gmail account identity.",
        ) from None
    except GmailApiError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gmail returned an error.",
        ) from None
    except GmailCredentialError:
        detail = (
            "Google OAuth is not configured on this server."
            if not settings.gmail_oauth_configured
            else "Stored Gmail credentials are unavailable. Reconnect Gmail."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        ) from None
    except EncryptionError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stored Gmail credentials could not be decrypted. Reconnect Gmail.",
        ) from None
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable.",
        ) from None
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid synchronization request.",
        ) from None
    except GmailError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gmail returned an error.",
        ) from None
    except Exception as exc:  # noqa: BLE001 - never leak internal details
        logger.warning("Gmail synchronization failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gmail synchronization failed.",
        ) from None

    return SyncResponse(
        google_email=result.google_email,
        considered=result.considered,
        new_messages=result.new_messages,
        updated_messages=result.updated_messages,
        total_stored=result.total_stored,
        synced_at=result.synced_at,
        history_id=result.history_id,
    )


@router.get("/messages", response_model=MessageList)
def list_messages(
    response: Response,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> MessageList:
    _no_store(response)
    documents, total = store.list_messages(user_id=user_id, limit=limit, offset=offset)
    return MessageList(
        items=[_summary(document) for document in documents],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/messages/{message_id}", response_model=MessageDetail)
def get_message(
    message_id: str,
    response: Response,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> MessageDetail:
    _no_store(response)
    if not _MESSAGE_ID_RE.fullmatch(message_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found."
        )
    document = store.get_message(user_id=user_id, gmail_message_id=message_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found."
        )
    return _detail(document)


@router.delete(
    "/connection",
    response_model=DisconnectResponse,
    dependencies=[Depends(require_csrf)],
)
def disconnect_gmail(
    response: Response,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
    cipher=Depends(get_optional_cipher),
) -> DisconnectResponse:
    _no_store(response)
    try:
        result = disconnect_account(store=store, cipher=cipher, user_id=user_id)
    except GmailNotConnected:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Gmail connection exists.",
        ) from None
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable.",
        ) from None
    return DisconnectResponse(
        disconnected=True,
        revoked=result.revoked,
        deleted_messages=result.deleted_messages,
    )
