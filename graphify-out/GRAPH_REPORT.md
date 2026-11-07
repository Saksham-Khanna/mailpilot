# Graph Report - mailpilot  (2026-11-07)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 761 nodes · 2037 edges · 26 communities (20 shown, 6 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 211 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `91d75360`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.jsx
- routes/gmail.py
- GmailClient
- main.py
- Settings
- gmail_sync.py
- mime.py
- routes/drafts.py
- test_gmail_routes.py
- sessions.py
- EncryptionError
- package.json
- mongodb
- routes/opportunities.py
- GmailStore
- test_drafts.py
- test_opportunities.py
- .upsert_messages
- datetime
- test_gmail_store.py
- Header.jsx
- .ensure_indexes

## God Nodes (most connected - your core abstractions)
1. `GmailStore` - 41 edges
2. `GmailClient` - 37 edges
3. `Settings` - 35 edges
4. `sync_inbox()` - 32 edges
5. `FakeService` - 25 edges
6. `normalize_gmail_message()` - 23 edges
7. `get_settings()` - 23 edges
8. `EncryptionError` - 22 edges
9. `FakeCredentials` - 21 edges
10. `create_app()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `gmail_sync()` --uses--> `SyncResponse`  [INFERRED]
  backend/app/api/routes/gmail.py → backend/app/schemas/gmail.py
- `send_draft()` --uses--> `EncryptionError`  [INFERRED]
  backend/app/api/routes/drafts.py → backend/app/core/crypto.py
- `gmail_sync()` --uses--> `EncryptionError`  [INFERRED]
  backend/app/api/routes/gmail.py → backend/app/core/crypto.py
- `Settings` --uses--> `EncryptionError`  [INFERRED]
  backend/app/core/config.py → backend/app/core/crypto.py
- `create_app()` --uses--> `EncryptionError`  [INFERRED]
  backend/app/main.py → backend/app/core/crypto.py

## Import Cycles
- None detected.

## Communities (26 total, 6 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.07
Nodes (77): App(), useHashRoute(), EmptyState(), ErrorBanner(), Button(), ERROR_LABELS, errorLabel(), GmailConnectionCard() (+69 more)

### Community 1 - "routes/gmail.py"
Cohesion: 0.06
Nodes (39): get_current_user(), get_gmail_client_factory(), get_gmail_store(), get_optional_cipher(), get_token_cipher(), require_csrf(), _aware(), _format_log() (+31 more)

### Community 2 - "GmailClient"
Cohesion: 0.11
Nodes (24): create_message(), GmailClient, FakeCredentials, FakeService, http_error(), SequenceRequest, test_400_becomes_api_error(), test_401_refreshes_once_and_retries() (+16 more)

### Community 3 - "main.py"
Cohesion: 0.06
Nodes (26): SessionConfig, SessionMiddleware, close_client(), create_client(), describe_target(), get_database(), ping(), create_app() (+18 more)

### Community 4 - "Settings"
Cohesion: 0.08
Nodes (28): ConfigError, _parse_bool(), _parse_int(), _parse_origins(), Settings, _split_host_port(), _validate_http_url(), _validate_mongo_uri() (+20 more)

### Community 5 - "gmail_sync.py"
Cohesion: 0.09
Nodes (22): send_draft(), gmail_sync(), build_gmail_service(), GmailApiError, GmailAuthError, GmailError, GmailProfileError, GmailRateLimitError (+14 more)

### Community 6 - "mime.py"
Cohesion: 0.09
Nodes (23): _clean_text(), _decode_base64url(), _decode_header(), EmailParseError, html_to_text(), _HtmlTextExtractor, normalize_gmail_message(), NormalizedMessage (+15 more)

### Community 7 - "routes/drafts.py"
Cohesion: 0.10
Nodes (19): _aware(), delete_draft(), _format_draft(), generate_draft(), list_drafts(), _no_store(), regenerate_draft(), persist_refresh() (+11 more)

### Community 8 - "test_gmail_routes.py"
Cohesion: 0.11
Nodes (27): OAuthTokens, b64(), csrf(), FailingProfileClient, fake_exchange(), exchange(), FakeGmailClient, patch_start() (+19 more)

### Community 9 - "sessions.py"
Cohesion: 0.08
Nodes (10): _b64d(), _b64e(), generate_secret(), SessionSigner, auth_cookies(), client(), csrf_headers(), test_session_rejects_tampering_expiry_and_future_tokens() (+2 more)

### Community 10 - "EncryptionError"
Cohesion: 0.15
Nodes (11): EncryptionError, generate_key(), TokenCipher, validate_key(), _clear_settings_cache(), gmail_app(), token_key(), test_encrypt_decrypt_roundtrip_and_no_plaintext() (+3 more)

### Community 11 - "package.json"
Cohesion: 0.10
Nodes (25): dependencies, @fontsource-variable/manrope@^5.3.0, framer-motion@^14.6.0, lucide-react@^1.61.0, react@^19.3.1, react-dom@^19.3.1, devDependencies, tailwindcss@^4.3.3 (+17 more)

### Community 12 - "mongodb"
Cohesion: 0.09
Nodes (22): interval, retries, test, timeout, container_name, healthcheck, image, ports (+14 more)

### Community 13 - "routes/opportunities.py"
Cohesion: 0.19
Nodes (11): _aware(), classify_messages(), _format_classification(), get_opportunity_detail(), list_opportunities(), _no_store(), ClassifyRequest, ClassifyResponse (+3 more)

### Community 15 - "test_drafts.py"
Cohesion: 0.19
Nodes (5): auth_cookies(), client(), csrf_headers(), test_send_draft_missing_scope(), test_send_draft_success()

### Community 16 - "test_opportunities.py"
Cohesion: 0.23
Nodes (5): auth_cookies(), client(), csrf_headers(), test_classify_and_list_opportunities(), test_classify_sanitize_job_alert_digest()

### Community 17 - ".upsert_messages"
Cohesion: 0.18
Nodes (5): test_generate_and_update_draft(), test_reply_eligibility_and_no_reply_protection(), test_reply_eligibility_job_alerts_and_rejections(), test_disconnect_requires_csrf_and_deletes_everything(), test_classify_via_n8n_webhook_mock()

### Community 18 - "datetime"
Cohesion: 0.36
Nodes (3): _utcnow(), test_credentials_roundtrip_and_update(), test_oauth_state_is_single_use_user_bound_and_expiring()

### Community 19 - "test_gmail_store.py"
Cohesion: 0.36
Nodes (5): document(), test_message_upsert_deduplicates_and_scopes_users(), test_messages_are_sorted_and_bodies_excluded_from_lists(), test_store_available_type(), test_sync_state_and_deletion()

### Community 20 - "Header.jsx"
Cohesion: 0.53
Nodes (4): gmailPill(), Header(), StatusPill(), TONES

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GmailStore` connect `GmailStore` to `routes/gmail.py`, `main.py`, `gmail_sync.py`, `EncryptionError`, `test_drafts.py`, `.upsert_messages`, `datetime`, `test_gmail_store.py`, `.ensure_indexes`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `GmailStore` (e.g. with `get_gmail_store()` and `lifespan()`) actually correct?**
  _`GmailStore` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0673992673992674 - nodes in this community are weakly interconnected._
- **Why does `GmailClient` connect `GmailClient` to `main.py`, `gmail_sync.py`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `GmailClient` (e.g. with `create_app()` and `complete_connection()`) actually correct?**
  _`GmailClient` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `routes/gmail.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05719298245614035 - nodes in this community are weakly interconnected._
- **Why does `Settings` connect `Settings` to `routes/gmail.py`, `main.py`, `gmail_sync.py`, `routes/drafts.py`, `test_gmail_routes.py`, `EncryptionError`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._