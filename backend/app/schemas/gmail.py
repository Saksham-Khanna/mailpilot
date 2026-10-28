"""Pydantic response models for the Gmail API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SessionInfo(BaseModel):
    auth_mode: str = "development-anonymous"
    csrf_token: str
    expires_in: int
    warning: str = (
        "Development-only anonymous session. Replace with real user authentication "
        "before exposing real mailbox data."
    )


class GmailStatus(BaseModel):
    connected: bool
    google_email: str | None = None
    connected_at: datetime | None = None
    last_sync_at: datetime | None = None
    last_sync_status: str | None = None
    last_error: str | None = None
    needs_reconnect: bool = False
    message_count: int = 0


class SyncResponse(BaseModel):
    google_email: str
    considered: int
    new_messages: int
    updated_messages: int
    total_stored: int
    synced_at: datetime
    history_id: str | None = None


class MessageSummary(BaseModel):
    id: str
    thread_id: str
    sender_name: str = ""
    sender_email: str = ""
    recipient: str = ""
    subject: str = ""
    received_at: datetime
    snippet: str = ""
    labels: list[str] = Field(default_factory=list)
    synced_at: datetime | None = None
    has_body: bool = False


class MessageList(BaseModel):
    items: list[MessageSummary] = Field(default_factory=list)
    total: int = 0
    limit: int
    offset: int


class MessageDetail(MessageSummary):
    body_text: str = ""
    body_source: str = "none"


class DisconnectResponse(BaseModel):
    disconnected: bool = True
    revoked: bool = False
    deleted_messages: int = 0
