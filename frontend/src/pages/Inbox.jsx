import { useCallback, useEffect, useState } from "react";
import { Inbox as InboxIcon } from "lucide-react";
import GmailConnectionCard from "../components/GmailConnectionCard.jsx";
import MessageList from "../components/MessageList.jsx";
import MessageDetail from "../components/MessageDetail.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Panel from "../components/Panel.jsx";
import Notice from "../components/Notice.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import {
  disconnectGmail,
  getGoogleStartUrl,
  getMessage,
  getMessages,
  syncGmail,
} from "../lib/api.js";
import { pluralize } from "../lib/format.js";

const OAUTH_ERRORS = {
  access_denied: "Google authorization was cancelled.",
  invalid_state: "The authorization link was invalid, expired, or already used. Try again.",
  invalid_callback: "Google returned an incomplete authorization response. Try again.",
  exchange_failed: "Google rejected the authorization code. Try again.",
  oauth_not_configured: "Gmail OAuth is not configured on the server.",
  gmail_connection_failed: "MailPilot could not verify the Gmail account. Try again.",
  connection_failed: "The Gmail connection could not be completed. Try again.",
  server_error: "The server could not complete the Gmail connection. Try again.",
};

function readOAuthNotice() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("gmail")) return null;
  if (params.get("gmail") === "connected") {
    return {
      tone: "success",
      text: "Gmail connected. Press “Synchronize inbox” to fetch a limited batch of recent messages.",
    };
  }
  const reason = params.get("reason");
  return {
    tone: "error",
    text: OAUTH_ERRORS[reason] || "The Gmail connection failed. Try again.",
  };
}

export default function Inbox({ gmail, health }) {
  const [notice, setNotice] = useState(readOAuthNotice);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [messagesState, setMessagesState] = useState("loading");
  const [messagesError, setMessagesError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState("idle");
  const [detailError, setDetailError] = useState("");
  const [detailAttempt, setDetailAttempt] = useState(0);

  const connected = Boolean(gmail.status?.connected);

  // Remove the OAuth status query parameter without touching the hash route.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("gmail")) {
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${window.location.hash}`,
      );
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!connected) {
      setMessages([]);
      setTotal(0);
      setMessagesError("");
      setMessagesState("ready");
      return;
    }
    setMessagesState("loading");
    setMessagesError("");
    try {
      const data = await getMessages({ limit: 50, offset: 0 });
      setMessages(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
      setMessagesState("ready");
    } catch (err) {
      setMessagesError(err?.detail || err?.message || "Could not load synchronized messages.");
      setMessagesState("error");
    }
  }, [connected]);

  useEffect(() => {
    if (gmail.state === "ready") loadMessages();
  }, [gmail.state, loadMessages]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailState("idle");
      setDetailError("");
      return undefined;
    }
    let cancelled = false;
    setDetailState("loading");
    setDetailError("");
    getMessage(selectedId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDetailState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setDetailError(err?.detail || err?.message || "Could not load this message.");
        setDetailState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, detailAttempt]);

  useEffect(() => {
    if (
      selectedId &&
      messagesState === "ready" &&
      !messages.some((message) => message.id === selectedId)
    ) {
      setSelectedId(null);
      setDetail(null);
      setDetailState("idle");
    }
  }, [messages, messagesState, selectedId]);

  const handleConnect = () => {
    window.location.assign(getGoogleStartUrl());
  };

  const handleSync = async () => {
    if (!gmail.csrfToken) {
      setActionError("The browser session is not ready. Retry in a moment.");
      return;
    }
    setBusy("sync");
    setActionError("");
    try {
      const result = await syncGmail({ csrfToken: gmail.csrfToken });
      const changes = [];
      if (result.new_messages) changes.push(`${pluralize(result.new_messages, "new message")}`);
      if (result.updated_messages) {
        changes.push(`${pluralize(result.updated_messages, "refreshed message")}`);
      }
      if (changes.length === 0) changes.push("No new messages");
      setNotice({
        tone: "success",
        text: `Sync complete: ${changes.join(", ")}. ${pluralize(
          result.total_stored,
          "message",
        )} stored.`,
      });
      await gmail.refresh();
      await loadMessages();
    } catch (err) {
      setActionError(err?.detail || err?.message || "Could not synchronize the inbox.");
      if (err?.status === 401 || err?.status === 409) await gmail.refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmDisconnect = async () => {
    if (!gmail.csrfToken) {
      setActionError("The browser session is not ready. Retry in a moment.");
      return;
    }
    setBusy("disconnect");
    setActionError("");
    try {
      const result = await disconnectGmail({ csrfToken: gmail.csrfToken });
      setMessages([]);
      setTotal(0);
      setSelectedId(null);
      setDetail(null);
      setConfirming(false);
      const revokeMessage = result.revoked
        ? "Google access was revoked."
        : "Google revocation could not be confirmed, but local data was deleted.";
      setNotice({ tone: "success", text: `Gmail disconnected. ${revokeMessage}` });
      await gmail.refresh();
    } catch (err) {
      setActionError(err?.detail || err?.message || "Could not disconnect Gmail.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {health?.state === "offline" && <ErrorBanner onRetry={health.retry} />}

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {actionError && (
        <Notice tone="error" onDismiss={() => setActionError("")}>
          {actionError}
        </Notice>
      )}

      <GmailConnectionCard
        gmail={gmail}
        busy={busy}
        confirming={confirming}
        onConnect={handleConnect}
        onSync={handleSync}
        onDisconnect={() => setConfirming(true)}
        onCancelDisconnect={() => setConfirming(false)}
        onConfirmDisconnect={handleConfirmDisconnect}
        onRetry={gmail.refresh}
      />

      {gmail.state === "ready" && connected && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <MessageList
            items={messages}
            total={total}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={messagesState === "loading"}
            error={messagesState === "error" ? messagesError : ""}
            onRetry={loadMessages}
          />
          <MessageDetail
            message={detailState === "ready" ? detail : null}
            loading={detailState === "loading"}
            error={detailState === "error" ? detailError : ""}
            onRetry={() => setDetailAttempt((n) => n + 1)}
          />
        </div>
      )}

      {gmail.state === "ready" && !connected && (
        <Panel title="Synchronized inbox" icon={InboxIcon}>
          <EmptyState
            icon={InboxIcon}
            title="No Gmail account connected"
            description="Connect Gmail above, then synchronize a limited batch of recent inbox messages. Nothing is fetched until you press the button."
          />
        </Panel>
      )}
    </div>
  );
}
