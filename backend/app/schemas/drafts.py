"""Pydantic schemas for AI reply drafts and sending."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

DraftStatusType = Literal["draft", "saved", "approved", "sent"]
ReplyType = Literal["recruiter_outreach", "interview_invite", "application_followup", "general_reply"]


class GenerateDraftRequest(BaseModel):
    message_id: str
    reply_type: ReplyType = "general_reply"
    instructions: str | None = None
    confirm_no_reply: bool = False


class UpdateDraftRequest(BaseModel):
    recipient: str | None = None
    subject: str | None = None
    body: str | None = None
    status: DraftStatusType | None = None


class DraftResponse(BaseModel):
    draft_id: str
    message_id: str
    thread_id: str
    reply_type: str
    recipient: str
    subject: str
    body: str
    status: DraftStatusType
    created_at: datetime | None = None
    updated_at: datetime | None = None
    sent_at: datetime | None = None
    original_subject: str | None = None
    original_sender: str | None = None
    original_body: str | None = None
    reply_eligibility: str | None = None
    reason: str | None = None


class DraftListResponse(BaseModel):
    items: list[DraftResponse]
    total: int
    limit: int
    offset: int


class SendDraftResponse(BaseModel):
    sent: bool
    draft_id: str
    google_message_id: str | None = None
    sent_at: datetime
