"""AI email classification and opportunity extraction service using Groq LLM."""

from __future__ import annotations

import json
import logging
import os
import requests
from typing import Any

from app.core.config import Settings

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "Job Opportunity",
    "Internship Opportunity",
    "Interview Invitation",
    "Application Update",
    "Rejection",
    "Assessment",
    "Recruiter Outreach",
    "Newsletter",
    "Other",
}


def _heuristic_classify(subject: str, body: str) -> dict[str, Any]:
    text = f"{subject} {body}".lower()
    
    category = "Other"
    priority = "Medium"
    confidence = 0.75
    
    if "intern" in text:
        category = "Internship Opportunity"
        priority = "High"
    elif any(kw in text for kw in ["interview", "schedule a call", "recruiter chat", "availability"]):
        category = "Interview Invitation"
        priority = "High"
    elif any(kw in text for kw in ["offer", "job opportunity", "position", "we are hiring", "engineer", "developer"]):
        category = "Job Opportunity"
        priority = "High"
    elif any(kw in text for kw in ["unfortunately", "regret", "not moving forward", "status of your application", "other candidates"]):
        category = "Rejection"
        priority = "Low"
    elif any(kw in text for kw in ["assessment", "hackerrank", "coding test", "online test", "assignment"]):
        category = "Assessment"
        priority = "High"
    elif any(kw in text for kw in ["update on your application", "application received", "under review"]):
        category = "Application Update"
        priority = "Medium"
    elif any(kw in text for kw in ["newsletter", "digest", "weekly update", "edition"]):
        category = "Newsletter"
        priority = "Low"
    elif any(kw in text for kw in ["reaching out", "connect", "recruiter", "talent"]):
        category = "Recruiter Outreach"
        priority = "Medium"

    summary = subject[:120] if subject else "Email message regarding career or updates."
    
    opportunity = None
    if category in {"Job Opportunity", "Internship Opportunity"}:
        opportunity = {
            "company_name": None,
            "job_role": subject[:60] if subject else None,
            "location": None,
            "work_mode": "Remote / On-site",
            "salary": None,
            "skills": [],
            "deadline": None,
            "application_link": None,
        }

    return {
        "category": category,
        "summary": summary,
        "priority": priority,
        "confidence": confidence,
        "opportunity": opportunity,
    }


def classify_email(*, settings: Settings, subject: str, sender: str, body: str) -> dict[str, Any]:
    """Classify an email using Groq LLM with fallback to heuristic classification."""
    api_key = settings.groq_api_key
    model = settings.llm_model or "llama-3.3-70b-versatile"

    if not api_key:
        return _heuristic_classify(subject, body)

    prompt = f"""You are MailPilot, an AI email assistant for students and job seekers. Classify the following email into exactly ONE of these categories:
- Job Opportunity
- Internship Opportunity
- Interview Invitation
- Application Update
- Rejection
- Assessment
- Recruiter Outreach
- Newsletter
- Other

Also generate:
- summary: A concise 1-2 sentence summary of the email content.
- priority: "High", "Medium", or "Low"
- confidence: float between 0.0 and 1.0
- opportunity: If category is "Job Opportunity" or "Internship Opportunity", extract details (company_name, job_role, location, work_mode, salary, skills as array, deadline, application_link). If not a job/internship, set opportunity to null. Do not invent missing information; use null for unknown fields.

Return ONLY valid JSON matching this structure:
{{
  "category": "...",
  "summary": "...",
  "priority": "...",
  "confidence": 0.95,
  "opportunity": {{
    "company_name": "...",
    "job_role": "...",
    "location": "...",
    "work_mode": "...",
    "salary": "...",
    "skills": ["..."],
    "deadline": "...",
    "application_link": "..."
  }}
}}

Email Sender: {sender}
Email Subject: {subject}
Email Body:
{body[:3000]}
"""

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            },
            timeout=15,
        )
        if response.status_code != 200:
            logger.warning("Groq API returned status %s, using heuristic classification", response.status_code)
            return _heuristic_classify(subject, body)

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)

        category = parsed.get("category", "Other")
        if category not in VALID_CATEGORIES:
            category = "Other"

        return {
            "category": category,
            "summary": str(parsed.get("summary") or subject),
            "priority": parsed.get("priority") in {"High", "Medium", "Low"} and parsed.get("priority") or "Medium",
            "confidence": float(parsed.get("confidence", 0.9)),
            "opportunity": parsed.get("opportunity") if category in {"Job Opportunity", "Internship Opportunity"} else None,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Groq LLM classification failed (%s), using heuristic", type(exc).__name__)
        return _heuristic_classify(subject, body)
