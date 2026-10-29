"""API routes for AI email classification and opportunity extraction."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.deps import (
    get_current_user,
    get_gmail_store,
    require_csrf,
)
from app.core.config import get_settings
from app.schemas.opportunities import (
    ClassifyRequest,
    ClassifyResponse,
    EmailClassificationResponse,
    OpportunityListResponse,
)
from app.services.classifier import classify_email

logger = logging.getLogger(__name__)
router = APIRouter(tags=["opportunities"])


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _format_classification(doc: dict) -> EmailClassificationResponse:
    return EmailClassificationResponse(
        message_id=str(doc.get("gmail_message_id") or ""),
        thread_id=str(doc.get("gmail_thread_id") or ""),
        sender_name=str(doc.get("sender_name") or ""),
        sender_email=str(doc.get("sender_email") or ""),
        subject=str(doc.get("subject") or ""),
        received_at=_aware(doc.get("received_at")),
        category=doc.get("category", "Other"),
        summary=str(doc.get("summary") or ""),
        priority=doc.get("priority", "Medium"),
        confidence=float(doc.get("confidence", 0.8)),
        opportunity=doc.get("opportunity"),
        classified_at=_aware(doc.get("classified_at")),
    )


@router.get("", response_model=OpportunityListResponse)
def list_opportunities(
    response: Response,
    category: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> OpportunityListResponse:
    _no_store(response)
    docs, total = store.list_classifications(
        user_id=user_id, category=category, limit=limit, offset=offset
    )
    items = [_format_classification(d) for d in docs]
    return OpportunityListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/classify",
    response_model=ClassifyResponse,
    dependencies=[Depends(require_csrf)],
)
def classify_messages(
    response: Response,
    payload: ClassifyRequest | None = None,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> ClassifyResponse:
    _no_store(response)
    settings = get_settings()

    # Determine which messages to classify
    messages_to_classify = []
    if payload and payload.message_id:
        msg = store.get_message(user_id=user_id, gmail_message_id=payload.message_id)
        if not msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found.",
            )
        messages_to_classify = [msg]
    else:
        limit = payload.limit if payload and payload.limit else 20
        # Get all stored messages for user
        all_msgs, _ = store.list_messages(user_id=user_id, limit=limit, offset=0)
        for msg in all_msgs:
            # Check if already classified
            existing = store.get_classification(
                user_id=user_id, gmail_message_id=msg["gmail_message_id"]
            )
            if not existing:
                messages_to_classify.append(msg)

    classified_results = []
    now = datetime.now(tz=timezone.utc)

    for msg in messages_to_classify:
        subject = msg.get("subject", "")
        sender = f"{msg.get('sender_name', '')} <{msg.get('sender_email', '')}>"
        body = msg.get("body_text", "")

        result = classify_email(
            settings=settings,
            subject=subject,
            sender=sender,
            body=body,
        )

        classification_doc = {
            "gmail_message_id": msg["gmail_message_id"],
            "gmail_thread_id": msg.get("gmail_thread_id"),
            "sender_name": msg.get("sender_name"),
            "sender_email": msg.get("sender_email"),
            "subject": subject,
            "received_at": msg.get("received_at"),
            "category": result["category"],
            "summary": result["summary"],
            "priority": result["priority"],
            "confidence": result["confidence"],
            "opportunity": result["opportunity"],
        }

        store.upsert_classification(
            user_id=user_id,
            gmail_message_id=msg["gmail_message_id"],
            data=classification_doc,
            classified_at=now,
        )

        full_doc = {**classification_doc, "classified_at": now}
        classified_results.append(_format_classification(full_doc))

    return ClassifyResponse(
        classified_count=len(classified_results),
        items=classified_results,
    )


@router.get("/{message_id}", response_model=EmailClassificationResponse)
def get_opportunity_detail(
    response: Response,
    message_id: str,
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> EmailClassificationResponse:
    _no_store(response)
    doc = store.get_classification(user_id=user_id, gmail_message_id=message_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classification not found for this message.",
        )
    return _format_classification(doc)
