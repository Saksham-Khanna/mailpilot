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
    "Billing & Invoices",
    "Security Notice",
    "Transactional",
    "Other",
}


def _sanitize_opportunity(opp: Any, subject: str) -> dict[str, Any] | None:
    if not isinstance(opp, dict):
        return None
    
    company = opp.get("company_name") or opp.get("company")
    if company:
        company_lower = str(company).strip().lower()
        if company_lower in {"linkedin", "indeed", "glassdoor", "ziprecruiter", "handshake", "google alerts", "email digest", "quora", "openai"}:
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


def _heuristic_classify(*, subject: str, body: str, sender: str = "") -> dict[str, Any]:
    text = f"{sender} {subject} {body}".lower()
    
    category = "Other"
    priority = "Medium"
    confidence = 0.60
    
    reply_eligibility = "no_reply_needed"
    reason = "General informational message where no response is required."
    
    if any(kw in text for kw in ["payment", "billing", "invoice", "receipt", "charge", "subscription", "credit card", "update your payment", "payment failed", "go payment", "please update your"]):
        category = "Billing & Invoices"
        priority = "Low"
        reply_eligibility = "no_reply_needed"
        reason = "Automated billing or subscription notification not requiring a human reply."
        confidence = 0.95
    elif any(kw in text for kw in ["security alert", "password reset", "new sign-in", "verification code", "two-factor", "auth alert"]):
        category = "Security Notice"
        priority = "High"
        reply_eligibility = "no_reply_needed"
        reason = "Security or account notification not requiring a human response."
        confidence = 0.95
    elif any(kw in text for kw in ["offer", "congratulations", "pleased to offer"]):
        category = "Offer Letter"
        priority = "High"
        reply_eligibility = "reply_required"
        reason = "Job offer letter requiring a formal response, acceptance, or negotiation."
        confidence = 0.95
    elif any(kw in text for kw in ["interview", "schedule a call", "recruiter chat", "availability", "when are you free", "time to chat"]):
        category = "Interview"
        priority = "High"
        reply_eligibility = "reply_required"
        reason = "Interview invitation or scheduling request requiring your response and availability."
        confidence = 0.95
    elif any(kw in text for kw in ["assessment", "hackerrank", "coding test", "online test", "assignment"]):
        category = "Assessment"
        priority = "High"
        reply_eligibility = "reply_required"
        reason = "Assessment or coding test invitation requiring confirmation or completion."
        confidence = 0.95
    elif any(kw in text for kw in ["unfortunately", "regret", "not moving forward", "status of your application", "other candidates", "position has been filled", "decided not to move forward"]):
        category = "Rejection"
        priority = "Low"
        reply_eligibility = "no_reply_needed"
        reason = "Rejection notification or application status update informing you the decision is final and not requiring a reply."
        confidence = 0.95
    elif any(kw in text for kw in ["application received", "thank you for applying", "we have received your application", "application confirmation", "submission received", "update on your application"]):
        category = "Application Update"
        priority = "Medium"
        reply_eligibility = "no_reply_needed"
        reason = "Application submission confirmation informing you that your application was received; no reply needed."
        confidence = 0.92
    elif any(kw in text for kw in ["job opportunity", "we are hiring", "engineer position", "developer position", "job opening"]):
        category = "Job Opportunity"
        priority = "High" if "job alert" not in text else "Medium"
        reply_eligibility = "no_reply_needed" if "job alert" in text or "jobs matching" in text else "reply_recommended"
        reason = "Job opportunity or automated job alert."
        confidence = 0.85
    elif any(kw in text for kw in ["internship", "intern"]):
        category = "Internship"
        priority = "High"
        reply_eligibility = "reply_recommended"
        reason = "Internship opportunity where expressing interest is recommended."
        confidence = 0.85
    elif any(kw in text for kw in ["reaching out", "wanted to connect", "technical recruiter", "recruiter at", "talent at", "wanted to connect about", "connecting regarding"]) or ("recruiter" in sender.lower() and "opportunity" not in subject.lower()):
        category = "Recruiter Message"
        priority = "Medium"
        reply_eligibility = "reply_recommended"
        reason = "Direct recruiter outreach or message where a response is recommended."
        confidence = 0.85
    elif any(kw in text for kw in ["quora", "medium", "reddit", "digest", "newsletter", "weekly update", "edition", "no-reply", "notifications@", "suggested spaces"]):
        category = "Newsletter"
        priority = "Low"
        reply_eligibility = "no_reply_needed"
        reason = "Automated digest, Q&A update, or newsletter not requiring a response."
        confidence = 0.92
    elif any(kw in text for kw in ["due tomorrow", "reminder", "loan", "statement", "booking"]):
        category = "Transactional"
        priority = "Medium"
        reply_eligibility = "no_reply_needed"
        reason = "Informational transactional notice."
        confidence = 0.90

    # A question mark alone must NEVER trigger reply_recommended / reply_required unless explicitly conversational human intent
    if any(phrase in text for phrase in ["let me know", "confirm your availability", "please reply", "can you chat"]):
        if reply_eligibility == "no_reply_needed" and not any(kw in text for kw in ["unfortunately", "regret", "application received", "quora", "medium", "reddit", "digest", "newsletter", "notifications", "payment", "billing", "invoice"]):
            reply_eligibility = "reply_recommended"
            reason = "Email contains a direct call to action expecting a response."

    if "do not reply" in text or "no-reply" in text or "automated message" in text or "automated email" in text:
        if reply_eligibility != "reply_required":
            reply_eligibility = "no_reply_needed"
            reason = "Automated email indicating no reply is monitored or required."

    summary = subject[:120] if subject else "Email message regarding career or updates."
    
    opportunity = None
    if category in {"Job Opportunity", "Internship", "Internship Opportunity", "Offer Letter"}:
        if "job alert" not in text and "10 new" not in text and "digest" not in text and "matching your" not in text:
            opportunity = _sanitize_opportunity({
                "company_name": sender.split("<")[0].strip() if "<" in sender else sender,
                "job_role": subject,
                "location": None,
                "work_mode": None,
                "salary": None,
                "skills": [],
                "deadline": None,
                "application_link": None,
            }, subject)

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
            logger.warning("n8n webhook call failed (%s), falling back to Ollama/Groq/heuristic", type(exc).__name__)

    prompt = f"""You are MailPilot, an AI email assistant for students and job seekers. Classify the following email into exactly ONE of these categories:
- Job Opportunity
- Internship
- Interview
- Assessment
- Application Update
- Rejection
- Offer Letter
- Recruiter Message
- Newsletter
- Billing & Invoices
- Security Notice
- Transactional
- Other

CRITICAL CLASSIFICATION RULES:
1. Accurately distinguish all email types based on actual context, intent, sender and body content: Job/internship opportunities, job alert digests containing multiple openings, recruiter messages, interview invitations, assessments, application confirmations/status updates, rejections, offer letters, newsletters/promotional emails, billing/payment/invoices/subscriptions (Billing & Invoices), security/account notifications (Security Notice), general informational/transactional emails (Transactional), and previously unseen/unfamiliar email types (Other).
2. Evaluate reply eligibility independently from category classification ("reply_required", "reply_recommended", "no_reply_needed"). A question mark (?) alone in email subjects or digests (such as Quora questions or Q&A spaces like "If Russia invaded the UK...") must NEVER trigger reply_recommended or reply_required. Base reply eligibility purely on actual human intent and whether a response is expected.
3. For job alerts or digest emails containing multiple jobs, extract ONLY the top/most prominent featured job, or set opportunity to null if no specific verified single job opportunity is detailed. Do not treat multi-job digests as a single opportunity.
4. Extract only verified opportunity fields (company_name, job_role, location, work_mode, salary, skills, deadline, application_link). Never invent missing information or company names/roles; use null for unknown fields.
5. Provide a dynamic confidence score between 0.50 and 0.99 based on classification certainty. Handle ambiguous or unfamiliar emails conservatively (default to "Other", "no_reply_needed", and lower confidence).

Extract structured opportunity fields when available:
- company_name: The actual hiring company (NEVER put job boards like LinkedIn, Indeed, Glassdoor, Quora, OpenAI as company name; use null if unknown)
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
- confidence: float between 0.50 and 0.99
- reply_eligibility: Exactly one of "reply_required", "reply_recommended", or "no_reply_needed".
- reason: A concise 1 sentence explanation of why this reply eligibility was chosen based on email content.
- opportunity: Object with the above fields if category is Job Opportunity, Internship, Interview, or Offer Letter. If not an opportunity or if no specific job is detailed in a digest, set opportunity to null.

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

    # Try local Ollama API if configured
    ollama_url = getattr(settings, "ollama_base_url", "")
    ollama_model = getattr(settings, "ollama_model", "llama3")
    if ollama_url:
        try:
            ollama_response = requests.post(
                f"{ollama_url.rstrip('/')}/chat/completions",
                headers={"Content-Type": "application/json"},
                json={
                    "model": ollama_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "format": "json",
                },
                timeout=20,
            )
            if ollama_response.status_code == 200:
                data = ollama_response.json()
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
        except Exception as exc:
            logger.warning("Local Ollama classification failed (%s), falling back to Groq/heuristic", type(exc).__name__)

    # Fallback to direct Groq API if configured
    api_key = settings.groq_api_key
    model = settings.llm_model or "llama-3.3-70b-versatile"

    if not api_key:
        return _heuristic_classify(subject=subject, body=body, sender=sender)

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
            return _heuristic_classify(subject=subject, body=body, sender=sender)

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
        return _heuristic_classify(subject=subject, body=body, sender=sender)
