"""AI email classification and opportunity extraction service using local n8n webhook and Groq LLM."""

from __future__ import annotations

import json
import logging
import requests
from typing import Any

from app.core.config import Settings

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
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
}


def _sanitize_opportunity(opp: Any, subject: str) -> dict[str, Any] | None:
    if not isinstance(opp, dict):
        return None
    
    company = opp.get("company_name") or opp.get("company")
    if company:
        company_lower = str(company).strip().lower()
        if company_lower in {"linkedin", "indeed", "glassdoor", "ziprecruiter", "handshake", "google alerts", "email digest"}:
            company = None

    role = opp.get("job_role") or opp.get("role")
    if role:
        role_str = str(role).strip()
        alert_phrases = ["new jobs", "job alert", "jobs matching", "alerts for", "opportunities in", "updates on your", "digest"]
        if len(role_str) > 70 or any(p in role_str.lower() for p in alert_phrases) or role_str.lower() == subject.lower():
            role = None

    if not company and not role:
        return None

    return {
        "company_name": str(company) if company else None,
        "job_role": str(role) if role else None,
        "location": str(opp.get("location")) if opp.get("location") and str(opp.get("location")).lower() != "null" else None,
        "work_mode": str(opp.get("work_mode")) if opp.get("work_mode") and str(opp.get("work_mode")).lower() != "null" else None,
        "salary": str(opp.get("salary")) if opp.get("salary") and str(opp.get("salary")).lower() != "null" else None,
        "skills": [str(s) for s in opp.get("skills", []) if s] if isinstance(opp.get("skills"), list) else [],
        "deadline": str(opp.get("deadline")) if opp.get("deadline") and str(opp.get("deadline")).lower() != "null" else None,
        "application_link": str(opp.get("application_link") or opp.get("application_url")) if (opp.get("application_link") or opp.get("application_url")) and str(opp.get("application_link") or opp.get("application_url")).lower() != "null" else None,
    }


def _heuristic_classify(subject: str, body: str) -> dict[str, Any]:
    text = f"{subject} {body}".lower()
    
    category = "Other"
    priority = "Medium"
    confidence = 0.75
    
    reply_eligibility = "reply_recommended"
    reason = "General professional message where a response may be appropriate."
    
    if any(kw in text for kw in ["newsletter", "digest", "weekly update", "edition"]):
        category = "Newsletter"
        priority = "Low"
        reply_eligibility = "no_reply_needed"
        reason = "Automated newsletter or update providing information without expecting a response."
    elif any(kw in text for kw in ["job alert", "jobs matching", "alerts for", "new jobs"]):
        category = "Job Opportunity"
        priority = "Medium"
        reply_eligibility = "no_reply_needed"
        reason = "Automated job alert or digest listing multiple opportunities without asking for a direct response."
    elif any(kw in text for kw in ["unfortunately", "regret", "not moving forward", "status of your application", "other candidates", "position has been filled"]):
        category = "Rejection"
        priority = "Low"
        reply_eligibility = "no_reply_needed"
        reason = "Rejection notification or application status update informing you the decision is final and not requiring a reply."
    elif any(kw in text for kw in ["application received", "thank you for applying", "we have received your application", "application confirmation", "submission received"]):
        category = "Application Update"
        priority = "Medium"
        reply_eligibility = "no_reply_needed"
        reason = "Application submission confirmation informing you that your application was received; no reply needed."
    elif any(kw in text for kw in ["offer", "congratulations", "pleased to offer"]):
        category = "Offer Letter"
        priority = "High"
        reply_eligibility = "reply_required"
        reason = "Job offer letter requiring a formal response, acceptance, or negotiation."
    elif any(kw in text for kw in ["interview", "schedule a call", "recruiter chat", "availability", "when are you free", "time to chat"]):
        category = "Interview"
        priority = "High"
        reply_eligibility = "reply_required"
        reason = "Interview invitation or scheduling request requiring your response and availability."
    elif any(kw in text for kw in ["assessment", "hackerrank", "coding test", "online test", "assignment"]):
        category = "Assessment"
        priority = "High"
        reply_eligibility = "reply_required"
        reason = "Assessment or coding test invitation requiring confirmation or completion."
    elif any(kw in text for kw in ["job opportunity", "position", "we are hiring", "engineer", "developer"]):
        category = "Job Opportunity"
        priority = "High"
        reply_eligibility = "reply_recommended"
        reason = "Job opportunity where expressing interest or starting a conversation is recommended."
    elif any(kw in text for kw in ["reaching out", "connect", "recruiter", "talent", "profile"]):
        category = "Recruiter Message"
        priority = "Medium"
        reply_eligibility = "reply_recommended"
        reason = "Direct recruiter outreach or message where a response is recommended."

    if any(p in text for p in ["?", "let me know", "confirm", "availability", "reply", "respond"]):
        if reply_eligibility == "no_reply_needed" and not any(kw in text for kw in ["unfortunately", "regret", "application received"]):
            reply_eligibility = "reply_recommended"
            reason = "Email contains questions or a call to action expecting a response."
    if "do not reply" in text or "no-reply" in text or "automated message" in text or "automated email" in text:
        if reply_eligibility != "reply_required":
            reply_eligibility = "no_reply_needed"
            reason = "Automated email indicating no reply is monitored or required."

    summary = subject[:120] if subject else "Email message regarding career or updates."
    
    opportunity = None
    if category in {"Job Opportunity", "Internship", "Internship Opportunity", "Offer Letter"}:
        opportunity = {
            "company_name": None,
            "job_role": None,
            "location": None,
            "work_mode": None,
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
        "reply_eligibility": reply_eligibility,
        "reason": reason,
    }


def classify_email(*, settings: Settings, subject: str, sender: str, body: str) -> dict[str, Any]:
    """Classify an email via local n8n webhook, with fallback to direct Groq or heuristic classification."""
    n8n_url = settings.n8n_webhook_url
    if n8n_url:
        try:
            response = requests.post(
                n8n_url,
                json={
                    "subject": subject,
                    "sender": sender,
                    "body": body[:3000],
                },
                timeout=8,
            )
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    data = data[0].get("json", data[0])
                if isinstance(data, dict):
                    parsed = data.get("result", data)
                    if isinstance(parsed, str):
                        try:
                            parsed = json.loads(parsed)
                        except Exception:
                            pass
                    if isinstance(parsed, dict) and "category" in parsed:
                        category = parsed.get("category", "Other")
                        if category not in VALID_CATEGORIES:
                            category = "Other"
                        reply_eligibility = parsed.get("reply_eligibility", "reply_recommended")
                        if reply_eligibility not in {"reply_required", "reply_recommended", "no_reply_needed"}:
                            reply_eligibility = "reply_recommended"
                        reason = str(parsed.get("reason") or "Evaluated based on email content.")
                        opp_data = parsed.get("opportunity") if category in {"Job Opportunity", "Internship", "Internship Opportunity", "Interview", "Offer Letter"} else None
                        sanitized_opp = _sanitize_opportunity(opp_data, subject) if opp_data else None
                        return {
                            "category": category,
                            "summary": str(parsed.get("summary") or subject),
                            "priority": parsed.get("priority") in {"High", "Medium", "Low"} and parsed.get("priority") or "Medium",
                            "confidence": float(parsed.get("confidence", 0.9)),
                            "opportunity": sanitized_opp,
                            "reply_eligibility": reply_eligibility,
                            "reason": reason,
                        }
        except Exception as exc:
            logger.warning("n8n webhook call failed (%s), falling back to direct Groq/heuristic", type(exc).__name__)

    # Fallback to direct Groq API if configured
    api_key = settings.groq_api_key
    model = settings.llm_model or "llama-3.3-70b-versatile"

    if not api_key:
        return _heuristic_classify(subject, body)

    prompt = f"""You are MailPilot, an AI email assistant for students and job seekers. Classify the following email into exactly ONE of these categories:
- Job Opportunity
- Internship
- Interview
- Assessment
- Application Update
- Rejection
- Offer Letter
- Recruiter Message
- Other

For job alerts or digest emails containing multiple jobs, extract ONLY the top/most prominent featured job (do not treat the entire digest as a single job).

Extract structured opportunity fields when available:
- company_name: The actual hiring company (NEVER put job boards like LinkedIn, Indeed, Glassdoor as company name; use null if unknown)
- job_role: A clean specific job title (NEVER use email subject lines or alert phrases as the job role; use null if unknown)
- location: City, State or Remote
- work_mode: Remote, Hybrid, or On-site
- salary: Compensation range or null
- skills: Array of technical/professional skills or []
- deadline: Application deadline or null
- application_link: Direct application URL or null

Also generate:
- summary: A concise 1-2 sentence summary of the email content.
- priority: "High", "Medium", or "Low"
- confidence: float between 0.0 and 1.0
- reply_eligibility: Exactly one of "reply_required" (for interview invites, scheduling requests, assessments, offers, or direct questions), "reply_recommended" (for recruiter outreach or job opportunities where responding is recommended), or "no_reply_needed" (for application confirmations, job alerts/digests, newsletters, rejections, status updates, or informational emails).
- reason: A concise 1 sentence explanation of why this reply eligibility was chosen based on email content.
- opportunity: Object with the above fields if category is Job Opportunity, Internship, Interview, or Offer Letter. If not an opportunity or if no specific job is detailed in a digest, set opportunity to null. Do not invent missing information; use null for unknown fields.

Return ONLY valid JSON matching this structure:
{{
  "category": "...",
  "summary": "...",
  "priority": "...",
  "confidence": 0.95,
  "reply_eligibility": "reply_recommended",
  "reason": "...",
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

        reply_eligibility = parsed.get("reply_eligibility", "reply_recommended")
        if reply_eligibility not in {"reply_required", "reply_recommended", "no_reply_needed"}:
            reply_eligibility = "reply_recommended"
        reason = str(parsed.get("reason") or "Evaluated based on email content.")

        opp_data = parsed.get("opportunity") if category in {"Job Opportunity", "Internship", "Internship Opportunity", "Interview", "Offer Letter"} else None
        sanitized_opp = _sanitize_opportunity(opp_data, subject) if opp_data else None

        return {
            "category": category,
            "summary": str(parsed.get("summary") or subject),
            "priority": parsed.get("priority") in {"High", "Medium", "Low"} and parsed.get("priority") or "Medium",
            "confidence": float(parsed.get("confidence", 0.9)),
            "opportunity": sanitized_opp,
            "reply_eligibility": reply_eligibility,
            "reason": reason,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Groq LLM classification failed (%s), using heuristic", type(exc).__name__)
        return _heuristic_classify(subject, body)
