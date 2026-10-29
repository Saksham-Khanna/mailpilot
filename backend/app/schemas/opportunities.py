"""Pydantic schemas for AI email classification and opportunity extraction."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

CategoryType = Literal[
    "Job Opportunity",
    "Internship Opportunity",
    "Interview Invitation",
    "Application Update",
    "Rejection",
    "Assessment",
    "Recruiter Outreach",
    "Newsletter",
    "Other",
]

PriorityType = Literal["High", "Medium", "Low"]


class OpportunityDetail(BaseModel):
    company_name: str | None = None
    job_role: str | None = None
    location: str | None = None
    work_mode: str | None = None
    salary: str | None = None
    skills: list[str] | None = None
    deadline: str | None = None
    application_link: str | None = None


class EmailClassificationResponse(BaseModel):
    message_id: str
    thread_id: str
    sender_name: str
    sender_email: str
    subject: str
    received_at: datetime | None = None
    category: CategoryType
    summary: str
    priority: PriorityType
    confidence: float
    opportunity: OpportunityDetail | None = None
    classified_at: datetime | None = None


class OpportunityListResponse(BaseModel):
    items: list[EmailClassificationResponse]
    total: int
    limit: int
    offset: int


class ClassifyRequest(BaseModel):
    message_id: str | None = None
    limit: int | None = Field(default=20, ge=1, le=50)


class ClassifyResponse(BaseModel):
    classified_count: int
    items: list[EmailClassificationResponse]
