import { useCallback, useEffect, useState, useRef } from "react";
import {
  Inbox as InboxIcon,
  Filter,
  ArrowUpDown,
  ChevronDown,
  Plus,
  Mail,
  Star,
  Clock,
  Send,
  Archive,
  Target,
  CheckCircle,
  RefreshCw,
  Unplug,
  AlertTriangle,
  Loader2,
  Search,
  Bell,
  ChevronRight,
} from "lucide-react";
import MessageList from "../components/MessageList.jsx";
import MessageDetail from "../components/MessageDetail.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Notice from "../components/Notice.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import {
  disconnectGmail,
  getGoogleStartUrl,
  getMessage,
  getMessages,
  syncGmail,
} from "../lib/api.js";
import { pluralize, formatDateTime } from "../lib/format.js";

function getMessageCategory(message) {
  const text = `${message.subject || ""} ${message.snippet || ""} ${message.sender_name || ""} ${message.sender_email || ""}`.toLowerCase();
  if (text.includes("linkedin")) {
    return "Optional";
  }
  if (
    text.includes("intern") ||
    text.includes("engineer") ||
    text.includes("opportunity") ||
    text.includes("opportunities") ||
    text.includes("role") ||
    text.includes("developer") ||
    text.includes("sde") ||
    text.includes("job") ||
    text.includes("jobs") ||
    text.includes("careers") ||
    text.includes("hiring") ||
    text.includes("alert") ||
    text.includes("position")
  ) {
    return "Opening";
  }
  if (text.includes("interview") || text.includes("schedule") || text.includes("invitation")) {
    return "Priority";
  }
  if (text.includes("reply") || text.includes("question") || text.includes("availability") || text.includes("challenge")) {
    return "Needs Response";
  }
  return "Update";
}

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

  const [activeTab, setActiveTab] = useState("All");
  const [activeCategory, setActiveCategory] = useState("All Emails");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const connected = Boolean(gmail.status?.connected);
  const status = gmail.status || {};
  const emailAddress = status.google_email || "";
  const userName = emailAddress ? emailAddress.split("@")[0].charAt(0).toUpperCase() + emailAddress.split("@")[0].slice(1) : "Saksham";

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
      const fetchedItems = Array.isArray(data?.items) ? data.items : [];
      setMessages(fetchedItems);
      setTotal(Number(data?.total) || fetchedItems.length);
      setMessagesState("ready");

      if (fetchedItems.length > 0 && (!selectedId || !fetchedItems.some((m) => m.id === selectedId))) {
        setSelectedId(fetchedItems[0].id);
      }
    } catch (err) {
      setMessagesError(err?.detail || err?.message || "Could not load synchronized messages.");
      setMessagesState("error");
    }
  }, [connected, selectedId]);

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
      setNotice({
        tone: "success",
        text: `Sync complete: ${pluralize(result.new_messages, "new message")} stored.`,
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
      await disconnectGmail({ csrfToken: gmail.csrfToken });
      setMessages([]);
      setTotal(0);
      setSelectedId(null);
      setDetail(null);
      setConfirming(false);
      setNotice({ tone: "success", text: "Gmail disconnected successfully." });
      await gmail.refresh();
    } catch (err) {
      setActionError(err?.detail || err?.message || "Could not disconnect Gmail.");
    } finally {
      setBusy(null);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        m.subject?.toLowerCase().includes(q) ||
        m.sender_name?.toLowerCase().includes(q) ||
        m.sender_email?.toLowerCase().includes(q) ||
        m.snippet?.toLowerCase().includes(q);
      if (!matchSearch) return false;
    }

    const cat = getMessageCategory(m);

    if (activeTab === "Openings") {
      if (cat !== "Opening") return false;
    } else if (activeTab === "Needs Response") {
      if (cat !== "Needs Response") return false;
    }

    if (activeCategory === "Openings") {
      if (cat !== "Opening") return false;
    } else if (activeCategory === "Priority") {
      if (cat !== "Priority") return false;
    } else if (activeCategory === "Needs Response") {
      if (cat !== "Needs Response") return false;
    }

    return true;
  });

  return (
    <div className="flex flex-col gap-6 font-sans text-fg">
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

      {/* Top Search & Profile Bar matching Image 1 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#303034] bg-[#19191C] p-4 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[#303034] bg-[#0B0B0D] pl-10 pr-16 py-2 text-xs text-fg focus:border-[#D4AF37] focus:outline-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-[#1F1F22] px-1.5 py-0.5 text-[10px] text-muted font-mono">
            Ctrl + K
          </span>
        </div>

        <div className="flex items-center gap-3">
          {connected ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#303034] bg-[#0B0B0D] px-3 py-2 text-xs font-medium text-muted hover:text-fg"
            >
              <Unplug className="size-3.5" /> Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3 py-2 text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5D77A]"
            >
              <Mail className="size-3.5" /> Connect Gmail
            </button>
          )}
          <button
            type="button"
            onClick={handleSync}
            disabled={busy === "sync" || !connected}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0B0B0D] shadow-md hover:bg-[#F5D77A] disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${busy === "sync" ? "animate-spin" : ""}`} /> Sync Inbox
          </button>
          <div className="relative grid size-9 place-items-center rounded-xl border border-[#303034] bg-[#0B0B0D] text-muted hover:text-fg cursor-pointer">
            <Bell className="size-4" />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#303034] bg-[#0B0B0D] px-3 py-1.5 text-xs font-semibold text-fg">
            <span className="grid size-6 place-items-center rounded-lg bg-[#1F1F22] border border-[#303034] text-[#D4AF37] font-bold text-[11px]">
              {userName.charAt(0)}
            </span>
            <span>{userName}</span>
            <ChevronDown className="size-3.5 text-muted" />
          </div>
        </div>
      </div>

      {/* Disconnect Modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#303034] bg-[#19191C] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-400" /> Disconnect Gmail?
            </h3>
            <p className="mt-3 text-sm text-muted">
              This deletes stored OAuth credentials and synchronized messages from MailPilot and revokes token access. This cannot be undone.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#303034]">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-[#303034] bg-[#1F1F22] px-4 py-2 text-sm font-semibold text-fg hover:bg-[#2A2A2E]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={Boolean(busy)}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {busy === "disconnect" ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                Confirm Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Metric Pills & Sort Bar matching Image 1 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#303034] bg-[#19191C] p-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
          {[
            { label: "All", count: total || 1, active: activeTab === "All", onClick: () => setActiveTab("All") },
            { label: "Unread", count: 327, active: activeTab === "Unread", onClick: () => setActiveTab("Unread") },
            { label: "Openings", count: 42, active: activeTab === "Openings", onClick: () => setActiveTab("Openings") },
            { label: "Needs Response", count: 28, active: activeTab === "Needs Response", onClick: () => setActiveTab("Needs Response") },
          ].map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={tab.onClick}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 font-semibold transition-colors ${
                tab.active ? "bg-[#D4AF37] text-[#0B0B0D] shadow" : "border border-[#303034] bg-[#1F1F22] text-muted hover:text-fg"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${tab.active ? "bg-[#0B0B0D]/20 text-[#0B0B0D]" : "bg-[#0B0B0D] text-muted"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-xl border border-[#303034] bg-[#1F1F22] px-3 py-2 text-xs font-semibold text-muted">
            <ArrowUpDown className="size-3.5" /> Sort: Newest <ChevronDown className="size-3.5" />
          </div>
          <div className="flex items-center justify-center rounded-xl border border-[#303034] bg-[#1F1F22] p-2 text-muted hover:text-fg cursor-pointer">
            <Filter className="size-4" />
          </div>
        </div>
      </div>

      {/* Three-Column Layout */}
      <div className="grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        {/* Column 1: Categories & Labels Sidebar */}
        <div className="flex flex-col gap-6 rounded-2xl border border-[#303034] bg-[#19191C] p-4 shadow-sm">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted px-2 mb-2">Categories</p>
            <nav className="space-y-1">
              {[
                { id: "All Emails", label: "All Emails", count: total || 1428, icon: Mail, color: "text-[#D4AF37]" },
                { id: "Openings", label: "Openings", count: 42, icon: Target, color: "text-[#D4AF37]" },
                { id: "Priority", label: "Priority", count: 12, icon: Star, color: "text-amber-400" },
                { id: "Needs Response", label: "Needs Response", count: 28, icon: Clock, color: "text-rose-400" },
                { id: "Replied", label: "Replied", count: 268, icon: CheckCircle, color: "text-emerald-400" },
                { id: "Sent", label: "Sent", count: 310, icon: Send, color: "text-[#D4AF37]" },
                { id: "Archived", label: "Archived", count: 780, icon: Archive, color: "text-zinc-400" },
              ].map((cat) => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-[#D4AF37]/15 text-[#D4AF37] font-semibold ring-1 ring-[#D4AF37]/40"
                        : "text-muted hover:bg-[#1F1F22] hover:text-fg"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className={`size-4 ${cat.color}`} /> {cat.label}
                    </span>
                    <span className="text-muted">{cat.count}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-[#303034] pt-4">
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Labels</p>
              <button type="button" className="text-muted hover:text-fg"><Plus className="size-3.5" /></button>
            </div>
            <nav className="space-y-1">
              {[
                { label: "Internship", count: 16, color: "bg-rose-500" },
                { label: "Job", count: 21, color: "bg-cyan-500" },
                { label: "Collaboration", count: 7, color: "bg-[#D4AF37]" },
                { label: "Follow Up", count: 13, color: "bg-amber-500" },
              ].map((lbl) => (
                <span
                  key={lbl.label}
                  className="flex items-center justify-between rounded-xl px-3 py-1.5 text-xs text-muted hover:bg-[#1F1F22] hover:text-fg cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${lbl.color}`} /> {lbl.label}
                  </span>
                  <span>{lbl.count}</span>
                </span>
              ))}
            </nav>
          </div>
        </div>

        {/* Column 2: Email List */}
        <MessageList
          items={filteredMessages}
          total={total}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={messagesState === "loading"}
          error={messagesState === "error" ? messagesError : ""}
          onRetry={loadMessages}
        />

        {/* Column 3: Email Detail */}
        <MessageDetail
          message={detailState === "ready" ? detail : null}
          loading={detailState === "loading"}
          error={detailState === "error" ? detailError : ""}
          onRetry={() => setDetailAttempt((n) => n + 1)}
        />
      </div>
    </div>
  );
}
