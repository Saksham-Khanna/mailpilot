"""Pydantic schemas for activity logs and audit trail."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel

ActivityStatusType = Literal["success", "failed", "warning"]


class ActivityLogResponse(BaseModel):
    log_id: str
    activity_type: str
    description: str
    timestamp: datetime
    status: ActivityStatusType
    message_id: str | None = None
    metadata: dict[str, Any] | None = None


class ActivityLogListResponse(BaseModel):
    items: list[ActivityLogResponse]
    total: int
    limit: int
    offset: int
