"""Pydantic schemas for AI email classification and opportunity extraction."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator

CategoryType = Literal[
    "Job Opportunity",
    "Internship",
    "Internship Opportunity",
    "Interview",
    "Interview Invitation",
    "Assessment",
    "Application Update",
    "Rejection",
    "Offer Letter",
    "Recruiter Message",
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

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if not values.get("company_name") and values.get("company"):
                values["company_name"] = values["company"]
            if not values.get("job_role") and values.get("role"):
                values["job_role"] = values["role"]
            if not values.get("application_link") and values.get("application_url"):
                values["application_link"] = values["application_url"]
            if not values.get("application_link") and values.get("applicationUrl"):
                values["application_link"] = values["applicationUrl"]
        return values


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
    reply_eligibility: Literal["reply_required", "reply_recommended", "no_reply_needed"] = "reply_recommended"
    reason: str = "Standard message where a response may be useful."
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
