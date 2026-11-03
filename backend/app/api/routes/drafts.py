"""API routes for AI reply drafts and Gmail sending."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pymongo.errors import PyMongoError

from app.api.deps import (
    get_current_user,
    get_gmail_client_factory,
    get_gmail_store,
    get_token_cipher,
    require_csrf,
)
from app.core.config import get_settings
from app.core.crypto import EncryptionError
from app.services.classifier import classify_email
from app.schemas.drafts import (
    DraftListResponse,
    DraftResponse,
    GenerateDraftRequest,
    SendDraftResponse,
    UpdateDraftRequest,
)
from app.services.drafter import generate_reply_draft
from app.services.gmail_sync import GmailCredentialError, GmailNotConnected, _build_credentials
from app.services.gmail_client import (
    GmailApiError,
    GmailAuthError,
    GmailError,
    GmailRateLimitError,
    GmailUnavailableError,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["drafts"])


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _format_draft(doc: dict) -> DraftResponse:
    return DraftResponse(
        draft_id=str(doc.get("_id")),
        message_id=str(doc.get("message_id") or ""),
        thread_id=str(doc.get("thread_id") or ""),
        reply_type=str(doc.get("reply_type") or "general_reply"),
        recipient=str(doc.get("recipient") or ""),
        subject=str(doc.get("subject") or ""),
        body=str(doc.get("body") or ""),
        status=doc.get("status", "draft"),
        created_at=_aware(doc.get("created_at")),
        updated_at=_aware(doc.get("updated_at")),
        sent_at=_aware(doc.get("sent_at")),
        original_subject=str(doc.get("original_subject") or ""),
        original_sender=str(doc.get("original_sender") or ""),
        original_body=str(doc.get("original_body") or ""),
        reply_eligibility=str(doc.get("reply_eligibility") or "reply_recommended"),
        reason=str(doc.get("reason") or ""),
    )


@router.get("", response_model=DraftListResponse)
def list_drafts(
    response: Response,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> DraftListResponse:
    _no_store(response)
    docs, total = store.list_drafts(user_id=user_id, limit=limit, offset=offset)
    items = [_format_draft(d) for d in docs]
    return DraftListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/generate",
    response_model=DraftResponse,
    dependencies=[Depends(require_csrf)],
)
def generate_draft(
    response: Response,
    payload: GenerateDraftRequest,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> DraftResponse:
    _no_store(response)
    settings = get_settings()

    msg = store.get_message(user_id=user_id, gmail_message_id=payload.message_id)
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source email message not found.",
        )

    original_subject = msg.get("subject", "")
    sender_name = msg.get("sender_name", "")
    sender_email = msg.get("sender_email", "")
    original_sender = f"{sender_name} <{sender_email}>" if sender_name and sender_email else sender_email or sender_name
    original_body = msg.get("body_text", "")

    classification = store.get_classification(user_id=user_id, gmail_message_id=payload.message_id)
    reply_eligibility = "reply_recommended"
    reason = ""
    if classification:
        reply_eligibility = classification.get("reply_eligibility", "reply_recommended")
        reason = classification.get("reason", "")
    else:
        res_class = classify_email(settings=settings, subject=original_subject, sender=original_sender, body=original_body)
        reply_eligibility = res_class.get("reply_eligibility", "reply_recommended")
        reason = res_class.get("reason", "")
        store.upsert_classification(
            user_id=user_id,
            gmail_message_id=payload.message_id,
            data={
                "gmail_message_id": payload.message_id,
                "gmail_thread_id": msg.get("gmail_thread_id"),
                "sender_name": sender_name,
                "sender_email": sender_email,
                "subject": original_subject,
                "received_at": msg.get("received_at"),
                "category": res_class["category"],
                "summary": res_class["summary"],
                "priority": res_class["priority"],
                "confidence": res_class["confidence"],
                "opportunity": res_class["opportunity"],
                "reply_eligibility": reply_eligibility,
                "reason": reason,
            },
            classified_at=datetime.now(tz=timezone.utc),
        )

    if reply_eligibility == "no_reply_needed" and not payload.confirm_no_reply:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "reply_not_needed",
                "message": f"This email is classified as no reply needed. Reason: {reason or 'No reply is expected for this email.'}",
                "reply_eligibility": reply_eligibility,
                "reason": reason,
            },
        )

    generated = generate_reply_draft(
        settings=settings,
        original_subject=original_subject,
        original_sender=original_sender,
        original_body=original_body,
        reply_type=payload.reply_type,
        instructions=payload.instructions,
    )

    draft_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc)

    draft_doc = {
        "_id": draft_id,
        "message_id": payload.message_id,
        "thread_id": msg.get("gmail_thread_id", ""),
        "reply_type": payload.reply_type,
        "recipient": sender_email,
        "subject": generated["subject"],
        "body": generated["body"],
        "status": "draft",
        "created_at": now,
        "updated_at": now,
        "sent_at": None,
        "original_subject": original_subject,
        "original_sender": original_sender,
        "original_body": original_body,
        "reply_eligibility": reply_eligibility,
        "reason": reason,
    }

    store.upsert_draft(user_id=user_id, draft_id=draft_id, data=draft_doc)
    store.record_activity(
        user_id=user_id,
        activity_type="draft_generated",
        description=f"Generated AI reply draft ({payload.reply_type}).",
        status="success",
        message_id=payload.message_id,
        metadata={"reply_type": payload.reply_type},
    )
    return _format_draft(draft_doc)


@router.put(
    "/{draft_id}",
    response_model=DraftResponse,
    dependencies=[Depends(require_csrf)],
)
def update_draft(
    draft_id: str,
    response: Response,
    payload: UpdateDraftRequest,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> DraftResponse:
    _no_store(response)
    doc = store.get_draft(user_id=user_id, draft_id=draft_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reply draft not found.",
        )

    if doc.get("status") == "sent":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify a draft that has already been sent.",
        )

    now = datetime.now(tz=timezone.utc)
    updates: dict[str, Any] = {"updated_at": now}
    if payload.recipient is not None:
        updates["recipient"] = payload.recipient
    if payload.subject is not None:
        updates["subject"] = payload.subject
    if payload.body is not None:
        updates["body"] = payload.body
    if payload.status is not None:
        updates["status"] = payload.status

    updated_doc = {**doc, **updates}
    store.upsert_draft(user_id=user_id, draft_id=draft_id, data=updated_doc)
    act_type = "draft_saved" if payload.status == "saved" else "draft_edited"
    desc = "Reply draft saved." if payload.status == "saved" else "Reply draft updated/edited."
    store.record_activity(
        user_id=user_id,
        activity_type=act_type,
        description=desc,
        status="success",
        message_id=doc.get("message_id"),
    )
    return _format_draft(updated_doc)


@router.post(
    "/{draft_id}/regenerate",
    response_model=DraftResponse,
    dependencies=[Depends(require_csrf)],
)
def regenerate_draft(
    draft_id: str,
    response: Response,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> DraftResponse:
    _no_store(response)
    settings = get_settings()
    doc = store.get_draft(user_id=user_id, draft_id=draft_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reply draft not found.",
        )

    if doc.get("status") == "sent":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot regenerate a draft that has already been sent.",
        )

    generated = generate_reply_draft(
        settings=settings,
        original_subject=doc.get("original_subject", ""),
        original_sender=doc.get("original_sender", ""),
        original_body=doc.get("original_body", ""),
        reply_type=doc.get("reply_type", "general_reply"),
    )

    now = datetime.now(tz=timezone.utc)
    updated_doc = {
        **doc,
        "subject": generated["subject"],
        "body": generated["body"],
        "status": "draft",
        "updated_at": now,
    }
    store.upsert_draft(user_id=user_id, draft_id=draft_id, data=updated_doc)
    store.record_activity(
        user_id=user_id,
        activity_type="draft_regenerated",
        description="Regenerated AI reply draft.",
        status="success",
        message_id=doc.get("message_id"),
    )
    return _format_draft(updated_doc)


@router.delete(
    "/{draft_id}",
    response_model=dict,
    dependencies=[Depends(require_csrf)],
)
def delete_draft(
    draft_id: str,
    response: Response,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> dict:
    _no_store(response)
    doc = store.get_draft(user_id=user_id, draft_id=draft_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reply draft not found.",
        )
    if doc.get("status") == "sent":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a draft that has already been sent.",
        )
    success = store.delete_draft(user_id=user_id, draft_id=draft_id)
    if success:
        store.record_activity(
            user_id=user_id,
            activity_type="draft_discarded",
            description="Discarded reply draft.",
            status="success",
            message_id=doc.get("message_id"),
        )
    return {"deleted": success}


@router.post(
    "/{draft_id}/send",
    response_model=SendDraftResponse,
    dependencies=[Depends(require_csrf)],
)
def send_draft(
    draft_id: str,
    response: Response,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
    cipher=Depends(get_token_cipher),
    client_factory=Depends(get_gmail_client_factory),
) -> SendDraftResponse:
    _no_store(response)
    settings = get_settings()

    doc = store.get_draft(user_id=user_id, draft_id=draft_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reply draft not found.",
        )

    if doc.get("status") == "sent":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Draft has already been sent. Duplicate send prevented.",
        )

    connection = store.get_connection(user_id)
    credential_document = store.get_credentials(user_id)
    if connection is None or credential_document is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Gmail is not connected.",
        )

    # Validate send scope
    scopes = connection.get("scopes") or []
    can_send = "https://www.googleapis.com/auth/gmail.send" in scopes or any("gmail.send" in s or "gmail.modify" in s or "mail.google.com" in s for s in scopes)
    if not can_send:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Gmail send permission is not granted. Reconnect Gmail and grant send permission.",
        )

    try:
        credentials = _build_credentials(settings, credential_document, cipher)
        def persist_refresh(access_token: str, expiry: Any) -> None:
            store.update_access_token(
                user_id=user_id,
                encrypted_access_token=cipher.encrypt(access_token),
                access_token_expires_at=_aware(expiry),
            )

        client = client_factory(credentials, on_token_refresh=persist_refresh)
        recipient = doc.get("recipient", "")
        subject = doc.get("subject", "")
        body = doc.get("body", "")
        thread_id = doc.get("thread_id") or None

        send_res = client.send_message(to=recipient, subject=subject, body=body, thread_id=thread_id)
        google_msg_id = send_res.get("id")

        now = datetime.now(tz=timezone.utc)
        updated_doc = {
            **doc,
            "status": "sent",
            "sent_at": now,
            "updated_at": now,
            "google_message_id": google_msg_id,
        }
        store.upsert_draft(user_id=user_id, draft_id=draft_id, data=updated_doc)
        store.record_activity(
            user_id=user_id,
            activity_type="email_sent",
            description=f"Approved and sent email reply via Gmail to {recipient}.",
            status="success",
            message_id=doc.get("message_id"),
            metadata={"google_message_id": google_msg_id},
        )

        return SendDraftResponse(
            sent=True,
            draft_id=draft_id,
            google_message_id=google_msg_id,
            sent_at=now,
        )
    except GmailAuthError:
        store.record_activity(
            user_id=user_id,
            activity_type="workflow_error",
            description="Failed to send email reply (Gmail authorization expired).",
            status="failed",
            message_id=doc.get("message_id"),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Gmail authorization expired. Reconnect Gmail.",
        ) from None
    except GmailRateLimitError:
        store.record_activity(
            user_id=user_id,
            activity_type="workflow_error",
            description="Failed to send email reply (Gmail rate limit reached).",
            status="failed",
            message_id=doc.get("message_id"),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gmail rate limit reached. Try again shortly.",
        ) from None
    except (GmailUnavailableError, GmailApiError, GmailError, GmailCredentialError, EncryptionError, PyMongoError) as exc:
        store.record_activity(
            user_id=user_id,
            activity_type="workflow_error",
            description="Failed to send email reply through Gmail.",
            status="failed",
            message_id=doc.get("message_id"),
        )
        logger.warning("Failed to send draft via Gmail: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not send email through Gmail.",
        ) from None
    except Exception as exc:
        store.record_activity(
            user_id=user_id,
            activity_type="workflow_error",
            description="Unexpected error sending email reply.",
            status="failed",
            message_id=doc.get("message_id"),
        )
        logger.warning("Unexpected error sending draft: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send email.",
        ) from None
