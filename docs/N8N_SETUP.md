# n8n Local Setup Guide for MailPilot Phase 3

MailPilot uses a local n8n instance running via Docker Compose (`http://localhost:5678`) to handle AI email classification and opportunity extraction via Groq AI.

## Setup Instructions

1. **Start n8n**:
   Ensure Docker containers are running:
   ```bash
   docker compose up -d
   ```
   n8n is accessible at [http://localhost:5678](http://localhost:5678).

2. **Configure Groq API Credentials in n8n**:
   - Open n8n UI at `http://localhost:5678`.
   - Go to **Credentials** -> **New Credential**.
   - Search for **Groq API** (or Header Auth / API Key).
   - Enter your Groq API key (`GROQ_API_KEY`) securely.
   - Save the credentials and name them (or reference them in the Groq API HTTP Request node).

3. **Import Workflow**:
   - In n8n UI, click **Workflows** -> **Import from File**.
   - Select `n8n/mailpilot_classification_workflow.json` from the MailPilot repository root.
   - Activate the workflow.

4. **FastAPI Webhook Connection**:
   - FastAPI sends synchronized email payloads to `http://localhost:5678/webhook/mailpilot-classify`.
   - n8n processes the email using Groq AI, extracts structured fields (company, role, salary, deadline, etc.), and returns the structured classification to FastAPI, which validates and stores it in MongoDB.
