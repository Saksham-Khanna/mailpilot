// Backend base URL. VITE_* variables are bundled into client code and are public:
// never put secrets in them.
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api"
).replace(/\/$/, "");

const DEFAULT_TIMEOUT_MS = 8000;

async function request(
  path,
  { method = "GET", signal, csrfToken, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();

  if (signal?.aborted) {
    clearTimeout(timer);
    throw new DOMException("Request aborted", "AbortError");
  }
  signal?.addEventListener("abort", forwardAbort);

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      cache: "no-store",
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : null;
      const error = new Error(detail || `Request failed with status ${res.status}`);
      error.status = res.status;
      error.detail = detail;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export const getHealth = (opts) =>
  request("/health", { ...opts, timeoutMs: 4000 });

export const getSession = () => request("/auth/session", { timeoutMs: 6000 });

export const getGmailStatus = () => request("/gmail/status");

export const syncGmail = ({ csrfToken, limit } = {}) => {
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  return request(`/gmail/sync${query}`, {
    method: "POST",
    csrfToken,
    timeoutMs: 60000,
  });
};

export const getMessages = ({ limit = 50, offset = 0, signal } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request(`/gmail/messages?${params}`, { signal });
};

export const getMessage = (messageId) =>
  request(`/gmail/messages/${encodeURIComponent(messageId)}`);

export const disconnectGmail = ({ csrfToken } = {}) =>
  request("/gmail/connection", {
    method: "DELETE",
    csrfToken,
    timeoutMs: 20000,
  });

export const getClassifications = ({ category, limit = 50, offset = 0, signal } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (category) params.set("category", category);
  return request(`/opportunities?${params}`, { signal });
};

export const classifyEmails = ({ csrfToken, limit = 20 } = {}) => {
  return request("/opportunities/classify", {
    method: "POST",
    csrfToken,
    body: { limit },
    timeoutMs: 30000,
  });
};

export const getGoogleStartUrl = (includeSend = false) =>
  `${API_BASE_URL}/auth/google/start${includeSend ? "?include_send=true" : ""}`;

export const getDrafts = ({ limit = 50, offset = 0, signal } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request(`/drafts?${params}`, { signal });
};

export const generateDraft = ({ csrfToken, message_id, reply_type = "general_reply", instructions, confirm_no_reply } = {}) => {
  const body = { message_id, reply_type };
  if (instructions) body.instructions = instructions;
  if (confirm_no_reply) body.confirm_no_reply = true;
  return request("/drafts/generate", {
    method: "POST",
    csrfToken,
    body,
    timeoutMs: 30000,
  });
};

export const updateDraft = ({ csrfToken, draftId, recipient, subject, body, status } = {}) => {
  const payload = {};
  if (recipient !== undefined) payload.recipient = recipient;
  if (subject !== undefined) payload.subject = subject;
  if (body !== undefined) payload.body = body;
  if (status !== undefined) payload.status = status;
  return request(`/drafts/${encodeURIComponent(draftId)}`, {
    method: "PUT",
    csrfToken,
    body: payload,
    timeoutMs: 15000,
  });
};

export const deleteDraft = ({ csrfToken, draftId } = {}) => {
  return request(`/drafts/${encodeURIComponent(draftId)}`, {
    method: "DELETE",
    csrfToken,
    timeoutMs: 15000,
  });
};

export const regenerateDraft = ({ csrfToken, draftId } = {}) => {
  return request(`/drafts/${encodeURIComponent(draftId)}/regenerate`, {
    method: "POST",
    csrfToken,
    timeoutMs: 30000,
  });
};

export const sendDraft = ({ csrfToken, draftId } = {}) => {
  return request(`/drafts/${encodeURIComponent(draftId)}/send`, {
    method: "POST",
    csrfToken,
    timeoutMs: 30000,
  });
};

export const getActivityLogs = ({ limit = 50, offset = 0, activity_type, status, signal } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (activity_type) params.set("activity_type", activity_type);
  if (status) params.set("status", status);
  return request(`/logs?${params}`, { signal });
};
