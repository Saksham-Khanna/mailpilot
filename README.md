# MailPilot

Agentic email automation for students and job seekers: find recruiter email, extract opportunities, draft replies from your resume, and send only after you approve.

## Current status: Phase 2 (Gmail read-only connect + bounded inbox sync)

| Implemented | NOT implemented (planned) |
| --- | --- |
| FastAPI app with `/`, `/api/health`, `/api/health/database`, `/docs` | Email classification, LangGraph, LLM calls (Phase 3) |
| Google OAuth 2.0 (authorization code + PKCE) and encrypted token storage | Resume context and reply drafts (Phase 4) |
| Bounded, manual, read-only Gmail inbox sync and plain-text message viewing | Approval flow, Gmail sending, audit logs (Phase 5) |
| Development-only signed session cookie + CSRF on state-changing routes | Production authentication, incremental history sync, scheduled sync |
| React dashboard: real Gmail connection, inbox list, and message detail | Evaluation, Docker deployment, hardening (Phase 6) |
| 115 backend tests (pytest, all passing) and a verified frontend production build | Frontend unit/E2E tests; real-Gmail verification |

See **[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)** for the verification log, known limitations, and the Google Cloud setup checklist.

Gmail is **read-only**. The only scopes requested are `openid`, `email`, and `https://www.googleapis.com/auth/gmail.readonly`. There is no send, modify, or full-mailbox scope, and no LLM is called. Statistics that have no data source still display "—" rather than fabricated numbers. Opportunities, Reply Drafts, Activity Logs, and Settings remain labelled placeholders.

**Real Gmail was not verified.** Every Google call in the test suite is mocked, and this environment has no Google Cloud OAuth client. Connecting a real account requires the manual steps in the status document.

## Architecture

```
Browser (React + Vite, :5173)
        |  HTTP/JSON, session cookie, CSRF header
        v
FastAPI (:8000)  --OAuth/Gmail HTTPS-->  Google (accounts + Gmail API, read-only)
        |
        |  PyMongo
        v
MongoDB (:27017)   tokens stored Fernet-encrypted; message bodies stored as plain text
```

- Frontend checks `GET /api/health` on load and every 30 seconds, and offers **Retry**.
- `/api/health` is liveness only and reports `database.checked: false`. It never claims MongoDB is healthy.
- `/api/health/database` performs a real ping and returns **503** if unreachable. Health, session, and Gmail responses use `Cache-Control: no-store`.
- PyMongo connects lazily, so the app starts and tests run with MongoDB offline.
- CORS allows only the explicit origins in `FRONTEND_ORIGIN` (never `*`).
- The browser session is an anonymous signed HttpOnly cookie. It is **development-only**: whoever holds the cookie acts as that user. It is not production authentication.
- Gmail tokens never reach the browser, the URL, or logs. They are encrypted before being written.

## Repository structure

```
mailpilot/
├── backend/
│   ├── app/
│   │   ├── main.py                    # app factory, CORS, session, lifespan
│   │   ├── core/config.py             # Settings + validation
│   │   ├── core/crypto.py             # Fernet token encryption
│   │   ├── core/sessions.py           # signed cookie, CSRF, middleware
│   │   ├── api/deps.py                # user, CSRF, store, cipher, client
│   │   ├── api/routes/health.py       # health endpoints
│   │   ├── api/routes/auth.py         # session + Google OAuth
│   │   ├── api/routes/gmail.py        # status, sync, messages, disconnect
│   │   ├── db/mongodb.py              # client factory, ping, close
│   │   ├── db/gmail_store.py          # connections, credentials, messages
│   │   ├── schemas/gmail.py           # response models (no token fields)
│   │   └── services/                  # oauth, gmail client, mime, sync
│   ├── tests/                         # 115 tests; Google and Mongo are mocked
│   ├── requirements.txt               # pinned
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/                # Header, Sidebar, GmailConnectionCard, ...
│   │   ├── pages/                     # Overview, Inbox, ComingSoon
│   │   ├── lib/                       # api.js, useGmailConnection.js, navigation.js
│   │   ├── App.jsx  main.jsx  index.css
│   ├── package.json  vite.config.js
│   └── .env.example
├── docs/PROJECT_STATUS.md             # verified status + Google Cloud checklist
├── docker-compose.yml                 # local MongoDB only
└── .gitignore
```

New features go in `backend/app/api/routes/<feature>.py` (register in `main.py`), with data access under `backend/app/db/`.

## Prerequisites

Verified with **Python 3.12.10**, **Node.js 24.18.0**, **npm 11.16.0** on Windows. Python 3.11+ and Node.js 20.19+ (or 22.12+) are required by the pinned Vite version. MongoDB is required to connect Gmail; use Docker Desktop, a local server, or Atlas. A Google Cloud OAuth client is required for a real connection and is **not** required to run the tests.

## Setup (Windows PowerShell)

Run from the repository root (`D:\work\mailpilot\mailpilot`):

```powershell
# 1. MongoDB (required before connecting Gmail; the app and tests run without it)
docker compose up -d mongodb

# 2. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # if blocked: Set-ExecutionPolicy -Scope Process Bypass
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env

# 3. Secrets (paste the output into backend\.env; never commit .env)
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
.\.venv\Scripts\python.exe -c "from app.core.crypto import generate_key; print(generate_key())"

python -m uvicorn app.main:app --reload --port 8000

# 4. Frontend (new terminal, from the repository root)
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

If you prefer not to activate the virtual environment, replace `python` with
`.\.venv\Scripts\python.exe` in the backend commands (run them from `backend\`).

Open http://localhost:5173 (UI) and http://localhost:8000/docs (API docs).

**MongoDB Atlas:** set `MONGODB_URI` in `backend/.env` to your `mongodb+srv://...` string
(no port for `+srv`) and allow your IP in Atlas network access. Never commit `.env`.

**Built-app preview:** `npm run preview` serves on http://localhost:4173, which is **not**
in the default CORS list. Add `http://localhost:4173` to `FRONTEND_ORIGIN` in
`backend/.env` (restart the backend) if you want the preview to reach the API. OAuth
redirects use the **first** origin in that list.

### Connect a real Gmail account

Tests do not need any of this. To exercise the real flow:

1. In Google Cloud, create or select a project and enable the **Gmail API**.
2. Configure the OAuth consent screen as **External / Testing** and add your Google account as a test user.
3. Create an OAuth client (Web application) and register this redirect URI exactly:

   ```text
   http://localhost:8000/api/auth/google/callback
   ```

4. Put the client id and secret in `backend/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `TOKEN_ENCRYPTION_KEY` and (recommended) `SESSION_SECRET_KEY` using the commands above.
5. Start MongoDB, the backend, and the frontend. In the UI open **Inbox**, choose **Connect Gmail**, approve the read-only consent screen, then **Sync**.
6. Confirm the consent screen offers only read-only Gmail access. After disconnect, confirm the connection and its messages are gone.

The full checklist, including what to verify in logs and browser storage, is in
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## Tests and builds

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q      # no MongoDB and no Google account required
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m compileall -q app tests

cd ..\frontend
npm run build                                # production bundle in dist/
```

Last verified (2026-10-25):

- **115 passed**, 66 warnings, in 2.93s. Warnings are upstream/test-only (Starlette `TestClient`/`httpx`, `datetime.utcnow()` in a test helper and `mongomock`).
- `pip check`: no broken requirements.
- `compileall`: no output.
- Vite production build succeeded (`2371` modules; JS `400.54 kB`, gzip `126.54 kB`; CSS `27.76 kB`, gzip `8.72 kB`).

There are no frontend unit or end-to-end tests. The build only proves the frontend compiles and bundles. Google API calls are mocked; a real mailbox has not been connected from this environment.

## Environment variables

Backend (`backend/.env`):

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_NAME` | `MailPilot` | |
| `ENVIRONMENT` | `development` | `development`, `test`, `staging`, or `production` |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Comma-separated CORS origins; `*`, paths, and credentials are rejected. First origin receives OAuth redirects |
| `MONGODB_URI` | `mongodb://localhost:27017` | `mongodb://` or `mongodb+srv://` (no port with `+srv`); host required; never logged |
| `MONGODB_DATABASE` | `mailpilot` | Must not be empty |
| `SESSION_SECRET_KEY` | empty | At least 32 characters. Empty in development/test uses an ephemeral key (sessions reset on restart). Required in staging/production |
| `SESSION_MAX_AGE_SECONDS` | `1209600` | 300–31536000 |
| `SESSION_COOKIE_SECURE` | `false` (development); `true` in production | |
| `SESSION_COOKIE_SAMESITE` | `lax` | `lax`, `strict`, or `none`. `none` requires `SESSION_COOKIE_SECURE=true` |
| `OAUTH_STATE_TTL_SECONDS` | `600` | 60–3600. OAuth `state` is single-use and bound to the session |
| `GMAIL_SYNC_BATCH_SIZE` | `10` | 1–50. A sync request may override this up to 50 |
| `TOKEN_ENCRYPTION_KEY` | empty | Fernet key. Required to connect Gmail; required at startup in staging/production |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty | Must be set together. Server-side only |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/auth/google/callback` | Must match the URI registered in Google Cloud |
| `GROQ_API_KEY`, `LLM_MODEL` | empty | Reserved for Phase 3, unused |

Frontend (`frontend/.env`): `VITE_API_BASE_URL` (default `http://localhost:8000/api`). Everything prefixed `VITE_` ships to the browser, so never put secrets there. The backend never sends `MONGODB_URI`, `SESSION_SECRET_KEY`, `GROQ_API_KEY`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, or any OAuth token to the client.

## API

```powershell
curl.exe http://localhost:8000/
curl.exe http://localhost:8000/api/health
# {"status":"ok","service":"MailPilot","version":"0.1.0","environment":"development","database":{"checked":false}}
curl.exe http://localhost:8000/api/health/database
# 200 {"status":"ok","database":{"checked":true,"reachable":true}}
# 503 {"status":"unavailable","database":{"checked":true,"reachable":false}} while MongoDB is down
```

Gmail routes depend on the session cookie set by `SessionMiddleware`. State-changing routes also require the `X-CSRF-Token` header returned by `GET /api/auth/session`. Calling them with `curl.exe` without that cookie is not a useful smoke test; use the UI or the pytest suite.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/auth/session` | session cookie | CSRF token for this browser session. No identity |
| `GET` | `/api/auth/google/start` | session cookie | Stores a single-use state and redirects to Google. 503 if OAuth is not configured |
| `GET` | `/api/auth/google/callback` | session cookie | Consumes state, exchanges the code, stores encrypted tokens, redirects to the frontend with `?gmail=connected` or `?gmail=error&reason=...` |
| `GET` | `/api/gmail/status` | session cookie | Connection email, last sync, stored count, reconnect flag. No tokens |
| `POST` | `/api/gmail/sync` | session + CSRF | Bounded inbox sync. Optional `limit` (1–50) |
| `GET` | `/api/gmail/messages` | session cookie | Stored messages for this session only (`limit`, `offset`) |
| `GET` | `/api/gmail/messages/{message_id}` | session cookie | One message. Body is plain text, never HTML |
| `DELETE` | `/api/gmail/connection` | session + CSRF | Best-effort Google revocation, then local deletion |

Failure responses stay generic: 401 when Gmail authorization expired, 409 when syncing while disconnected, 404 for an unknown message or a missing connection, 502/503 for Gmail, database, or encryption problems. Bodies and headers never include tokens.

CORS allows `http://localhost:5173` by default; an unlisted `Origin` receives no
`Access-Control-Allow-Origin` header.

## Security notes for this phase

- Tokens are encrypted with Fernet before MongoDB writes. There is no plaintext fallback.
- OAuth `state` is stored as a SHA-256 hash, expires, is bound to the session user, and is consumed once. The PKCE verifier is encrypted at rest.
- The callback redirect carries only `gmail` and `reason`. It never carries a code or a token.
- Access tokens are refreshed on the server and the refreshed token is re-encrypted.
- Message HTML is converted to bounded plain text on the server. The UI renders that text as React text, not HTML.
- Disconnect deletes the connection, credentials, messages, sync state, and unused OAuth states for that user even if token decryption fails.
- Copying the session cookie lets someone act as that development user. Do not deploy this session model as production authentication.

`docker-compose.yml` runs MongoDB without auth, bound to localhost; that is fine for local development only.
