"""AI reply draft generation service using Groq LLM."""

from __future__ import annotations

import json
import logging
import requests
from typing import Any

from app.core.config import Settings

logger = logging.getLogger(__name__)


def generate_reply_draft(
    *,
    settings: Settings,
    original_subject: str,
    original_sender: str,
    original_body: str,
    reply_type: str,
    instructions: str | None = None,
) -> dict[str, str]:
    """Generate a professional email reply draft using Groq AI."""
    api_key = settings.groq_api_key
    model = settings.llm_model or "llama-3.3-70b-versatile"

    reply_type_labels = {
        "recruiter_outreach": "Response to Recruiter Outreach (expressing interest, sharing background, asking about role details)",
        "interview_invite": "Interview Invitation Response (confirming availability, expressing enthusiasm, asking logistics)",
        "application_followup": "Application Follow-up (polite check-in on status after submitting an application)",
        "general_reply": "General Professional Reply",
    }
    context_type = reply_type_labels.get(reply_type, "General Professional Reply")

    if not api_key:
        return _heuristic_draft(original_subject, original_sender)

    prompt = f"""You are MailPilot, an AI email assistant helping a job seeker/student write professional email replies.
Write a professional, polished email reply draft based on the original email below.

Reply Type / Goal: {context_type}
Additional User Instructions: {instructions or 'None'}

Original Email Sender: {original_sender}
Original Email Subject: {original_subject}
Original Email Body:
{original_body[:3000]}

Return ONLY valid JSON matching this exact structure:
{{
  "subject": "Re: ...",
  "body": "..."
}}
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
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=15,
        )
        if response.status_code != 200:
            logger.warning("Groq API returned status %s for draft generation", response.status_code)
            return _heuristic_draft(original_subject, original_sender)

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        subject = str(parsed.get("subject") or f"Re: {original_subject}")
        body = str(parsed.get("body") or "")
        return {"subject": subject, "body": body}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Groq draft generation failed (%s), using heuristic", type(exc).__name__)
        return _heuristic_draft(original_subject, original_sender)


def _heuristic_draft(original_subject: str, original_sender: str) -> dict[str, str]:
    sender_name = original_sender.split("<")[0].strip() or "Hiring Team"
    return {
        "subject": f"Re: {original_subject}" if original_subject else "Re: Inquiry",
        "body": f"Dear {sender_name},\n\nThank you for reaching out. I am writing to express my strong interest and would love to connect further.\n\nBest regards,\n[Your Name]",
    }
