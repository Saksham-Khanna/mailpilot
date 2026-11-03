"""API routes for activity logs and audit trail."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_current_user, get_gmail_store
from app.schemas.activity import ActivityLogListResponse, ActivityLogResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["activity"])


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _format_log(doc: dict) -> ActivityLogResponse:
    return ActivityLogResponse(
        log_id=str(doc.get("_id") or doc.get("log_id") or ""),
        activity_type=str(doc.get("activity_type") or "action"),
        description=str(doc.get("description") or ""),
        timestamp=_aware(doc.get("timestamp")) or datetime.now(tz=timezone.utc),
        status=doc.get("status", "success"),
        message_id=str(doc.get("message_id")) if doc.get("message_id") else None,
        metadata=doc.get("metadata"),
    )


@router.get("", response_model=ActivityLogListResponse)
def list_activity_logs(
    response: Response,
    activity_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user),
    store=Depends(get_gmail_store),
) -> ActivityLogListResponse:
    _no_store(response)
    docs, total = store.list_activity_logs(
        user_id=user_id,
        activity_type=activity_type,
        status=status,
        limit=limit,
        offset=offset,
    )
    items = [_format_log(d) for d in docs]
    return ActivityLogListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )
