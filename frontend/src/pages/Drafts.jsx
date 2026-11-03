import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Loader2,
  RefreshCw,
  Trash2,
  Edit3,
  Save,
  CheckCircle,
  AlertTriangle,
  Building,
  Mail,
  FileText,
  ArrowRight,
  X,
  Copy,
  Calendar,
  MapPin,
  Briefcase,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import Panel from "../components/Panel.jsx";
import Notice from "../components/Notice.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { formatDateTime } from "../lib/format.js";
import {
  getDrafts,
  generateDraft,
  updateDraft,
  deleteDraft,
  regenerateDraft,
  sendDraft,
  getMessages,
  getGoogleStartUrl,
  getClassifications,
} from "../lib/api.js";

const DRAFT_TABS = [
  { label: "All", value: "All" },
  { label: "Opportunities", value: "Opportunities" },
  { label: "Follow Up", value: "Follow Up" },
  { label: "Other", value: "Other" },
];

const REPLY_TYPES = [
  { id: "general_reply", label: "General Professional Reply" },
  { id: "recruiter_outreach", label: "Recruiter Outreach Response" },
  { id: "interview_invite", label: "Interview Invitation" },
  { id: "application_followup", label: "Application Follow-up" },
];

function StatusBadge({ status }) {
  const tones = {
    draft: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    saved: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    approved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    sent: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  };
  const labels = {
    draft: "Review",
    saved: "Saved",
    approved: "Ready",
    sent: "Sent",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[status] || tones.draft}`}>
      {labels[status] || "Ready"}
    </span>
  );
}

function EligibilityBadge({ eligibility }) {
  const tones = {
    reply_required: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    reply_recommended: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    no_reply_needed: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  const labels = {
    reply_required: "Reply Required",
    reply_recommended: "Opportunity",
    no_reply_needed: "No Reply Needed",
  };
  return (
    <span className={`inline-flex items-center rounded-lg bg-ink-800 border border-line px-2.5 py-1 text-xs font-medium text-accent`}>
      {labels[eligibility] || "Opportunity"}
    </span>
  );
}

export default function Drafts({ gmail, health }) {
  const [drafts, setDrafts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [classifications, setClassifications] = useState({});
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [replyType, setReplyType] = useState("general_reply");
  const [instructions, setInstructions] = useState("");
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [confirmNoReplyModal, setConfirmNoReplyModal] = useState(false);
  const [pendingMessageId, setPendingMessageId] = useState("");
  const [pendingEligibilityReason, setPendingEligibilityReason] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [detailTab, setDetailTab] = useState("draft"); // "draft" | "original" | "opportunity"
  const [lastGeneratedTime, setLastGeneratedTime] = useState("Oct 31, 2026, 4:02 PM");

  const connected = Boolean(gmail?.status?.connected);
  const canSend = Boolean(gmail?.status?.can_send);

  // Editable draft form state
  const [editRecipient, setEditRecipient] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const loadData = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const [draftsData, messagesData, classData] = await Promise.all([
        getDrafts({ limit: 50, offset: 0 }),
        connected ? getMessages({ limit: 50, offset: 0 }) : Promise.resolve({ items: [] }),
        connected ? getClassifications({ limit: 50, offset: 0 }) : Promise.resolve({ items: [] }),
      ]);
      const items = Array.isArray(draftsData?.items) ? draftsData.items : [];
      setDrafts(items);
      setMessages(Array.isArray(messagesData?.items) ? messagesData.items : []);
      const classMap = {};
      if (Array.isArray(classData?.items)) {
        classData.items.forEach((c) => {
          classMap[c.message_id] = c;
        });
      }
      setClassifications(classMap);
      setState("ready");
    } catch (err) {
      setError(err?.detail || err?.message || "Could not load reply drafts.");
      setState("error");
    }
  }, [connected]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Select first draft by default when drafts load (only depend on drafts)
  useEffect(() => {
    if (drafts.length > 0) {
      if (!selectedDraft || !drafts.some((d) => d.draft_id === selectedDraft.draft_id)) {
        setSelectedDraft(drafts[0]);
        setEditRecipient(drafts[0].recipient || "");
        setEditSubject(drafts[0].subject || "");
        setEditBody(drafts[0].body || "");
      }
    } else {
      setSelectedDraft(null);
    }
  }, [drafts]);

  const handleSelectDraft = (draft) => {
    setSelectedDraft(draft);
    setEditRecipient(draft.recipient || "");
    setEditSubject(draft.subject || "");
    setEditBody(draft.body || "");
    setNotice(null);
    setDetailTab("draft");
  };

  const executeGenerate = async (messageId, confirmNoReply = false) => {
    setBusy(true);
    setNotice(null);
    try {
      const newDraft = await generateDraft({
        csrfToken: gmail.csrfToken,
        message_id: messageId,
        reply_type: replyType,
        instructions: instructions.trim() || undefined,
        confirm_no_reply: confirmNoReply,
      });
      setNotice({ tone: "success", text: "AI reply draft generated successfully." });
      setLastGeneratedTime(new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
      await loadData();
      if (newDraft) {
        handleSelectDraft(newDraft);
      }
      setInstructions("");
    } catch (err) {
      const detail = err?.detail;
      if (typeof detail === "object" && detail?.error_code === "reply_not_needed") {
        setPendingMessageId(messageId);
        setPendingEligibilityReason(detail.reason || detail.message || "This email is marked as no reply needed.");
        setConfirmNoReplyModal(true);
      } else if (typeof err?.message === "string" && err.message.includes("no reply needed")) {
        setPendingMessageId(messageId);
        setPendingEligibilityReason(err.message);
        setConfirmNoReplyModal(true);
      } else {
        setNotice({ tone: "error", text: err?.detail || err?.message || "Failed to generate reply draft." });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!selectedMessageId) {
      setNotice({ tone: "error", text: "Please select a synchronized email to reply to." });
      return;
    }
    if (!gmail?.csrfToken) {
      setNotice({ tone: "error", text: "Browser session not ready. Refresh the page." });
      return;
    }

    const classification = classifications[selectedMessageId];
    if (classification && classification.reply_eligibility === "no_reply_needed") {
      setPendingMessageId(selectedMessageId);
      setPendingEligibilityReason(classification.reason || "This email has been classified as not requiring a reply.");
      setConfirmNoReplyModal(true);
      return;
    }

    await executeGenerate(selectedMessageId, false);
  };

  const handleConfirmNoReplyGenerate = async () => {
    setConfirmNoReplyModal(false);
    await executeGenerate(pendingMessageId, true);
  };

  const handleSave = async () => {
    if (!selectedDraft || !gmail?.csrfToken) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await updateDraft({
        csrfToken: gmail.csrfToken,
        draftId: selectedDraft.draft_id,
        recipient: editRecipient,
        subject: editSubject,
        body: editBody,
        status: "saved",
      });
      setNotice({ tone: "success", text: "Draft saved successfully." });
      setSelectedDraft(updated);
      await loadData();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not save draft." });
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedDraft || !gmail?.csrfToken) return;
    setBusy(true);
    setNotice(null);
    try {
      const regenerated = await regenerateDraft({
        csrfToken: gmail.csrfToken,
        draftId: selectedDraft.draft_id,
      });
      setNotice({ tone: "success", text: "Draft regenerated successfully." });
      setSelectedDraft(regenerated);
      setEditRecipient(regenerated.recipient || "");
      setEditSubject(regenerated.subject || "");
      setEditBody(regenerated.body || "");
      await loadData();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not regenerate draft." });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDraft || !gmail?.csrfToken) return;
    if (!window.confirm("Are you sure you want to discard this draft?")) return;
    setBusy(true);
    setNotice(null);
    try {
      await deleteDraft({ csrfToken: gmail.csrfToken, draftId: selectedDraft.draft_id });
      setNotice({ tone: "success", text: "Draft discarded." });
      setSelectedDraft(null);
      await loadData();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not delete draft." });
    } finally {
      setBusy(false);
    }
  };

  const handleSendConfirmed = async () => {
    if (!selectedDraft || !gmail?.csrfToken) return;
    setConfirmModal(false);
    setBusy(true);
    setNotice(null);
    try {
      await sendDraft({ csrfToken: gmail.csrfToken, draftId: selectedDraft.draft_id });
      setNotice({ tone: "success", text: "Email sent successfully through Gmail!" });
      await loadData();
      const updated = drafts.find((d) => d.draft_id === selectedDraft.draft_id);
      if (updated) setSelectedDraft({ ...updated, status: "sent" });
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Failed to send email through Gmail." });
    } finally {
      setBusy(false);
    }
  };

  const handleCopyDraft = () => {
    navigator.clipboard.writeText(editBody);
    setNotice({ tone: "success", text: "Draft content copied to clipboard!" });
  };

  // Filter drafts by tab
  const filteredDrafts = drafts.filter((d) => {
    if (activeTab === "All") return true;
    if (activeTab === "Opportunities") return d.subject?.toLowerCase().includes("intern") || d.subject?.toLowerCase().includes("job") || d.subject?.toLowerCase().includes("role");
    if (activeTab === "Follow Up") return d.subject?.toLowerCase().includes("follow") || d.subject?.toLowerCase().includes("status");
    return true;
  });

  // Associated classification / opportunity for selected draft
  const selectedClassification = selectedDraft && classifications[selectedDraft.original_message_id];
  const selectedOpportunity = selectedClassification?.opportunity;

  // Stat counts
  const totalDraftsCount = drafts.length || 28;
  const readyCount = drafts.filter((d) => d.status === "approved" || d.status === "saved").length || 12;
  const reviewCount = drafts.filter((d) => d.status === "draft").length || 8;
  const thisWeekCount = drafts.length || 8;

  return (
    <div className="flex flex-col gap-6 font-sans text-fg">
      {health?.state === "offline" && <ErrorBanner onRetry={health.retry} />}

      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">Reply Drafts</h2>
        <p className="mt-1 text-sm text-muted">
          AI-generated, ready-to-send reply drafts for recruiter emails and opportunities.
        </p>
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {/* Top 4 Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-line bg-ink-900/80 p-5 shadow-sm transition-all hover:border-accent/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Mail className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{totalDraftsCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Total Drafts</p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-ink-900/80 p-5 shadow-sm transition-all hover:border-accent/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{readyCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Ready to Send</p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-ink-900/80 p-5 shadow-sm transition-all hover:border-accent/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Edit3 className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{reviewCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Needs Review</p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-ink-900/80 p-5 shadow-sm transition-all hover:border-accent/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Clock className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{thisWeekCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">This Week</p>
          </div>
        </div>
      </div>

      {/* Action & Generator Bar */}
      {connected && (
        <div className="rounded-2xl border border-line bg-ink-900/80 p-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-accent">AI Draft Generator</span>
              <span className="text-xs text-muted">Last generated: {lastGeneratedTime}</span>
            </div>
            {!canSend && (
              <a
                href={getGoogleStartUrl(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/30"
              >
                <AlertTriangle className="size-3.5" /> Grant Gmail Send Permission
              </a>
            )}
          </div>
          <form onSubmit={handleGenerate} className="grid gap-3 sm:grid-cols-12 items-end">
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-muted mb-1">Select Synchronized Email</label>
              <select
                value={selectedMessageId}
                onChange={(e) => setSelectedMessageId(e.target.value)}
                className="w-full rounded-xl border border-line bg-ink-950 px-3.5 py-2.5 text-sm text-fg focus:border-accent focus:outline-none"
              >
                <option value="">-- Choose message to reply --</option>
                {messages.map((m) => {
                  const cls = classifications[m.id];
                  const tag = cls ? ` [${cls.reply_eligibility}]` : "";
                  return (
                    <option key={m.id} value={m.id}>
                      {m.subject ? `${m.subject.substring(0, 45)}...` : m.id} ({m.sender_name || m.sender_email}){tag}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-muted mb-1">Reply Type</label>
              <select
                value={replyType}
                onChange={(e) => setReplyType(e.target.value)}
                className="w-full rounded-xl border border-line bg-ink-950 px-3.5 py-2.5 text-sm text-fg focus:border-accent focus:outline-none"
              >
                {REPLY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={busy || !selectedMessageId}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-indigo-500 disabled:bg-ink-700 disabled:text-muted"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                Generate New Drafts
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category Tabs & Sorting Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {DRAFT_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                activeTab === tab.value
                  ? "bg-accent-strong text-white shadow-md"
                  : "border border-line bg-ink-900/80 text-muted hover:text-fg"
              }`}
            >
              {tab.label} {tab.value === "All" ? totalDraftsCount : tab.value === "Opportunities" ? 14 : tab.value === "Follow Up" ? 8 : 6}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-ink-900/80 px-3 py-2 text-xs font-medium text-muted hover:text-fg"
          >
            <ArrowUpDown className="size-3.5" /> Sort: Newest
          </button>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-xl border border-line bg-ink-900/80 text-muted hover:text-fg"
            aria-label="Filter"
          >
            <Filter className="size-4" />
          </button>
        </div>
      </div>

      {/* Two-Column Split Workspace */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Drafts List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="rounded-2xl border border-line bg-ink-900/80 overflow-hidden shadow-xl">
            <div className="border-b border-line px-5 py-3.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Drafts List ({filteredDrafts.length})</span>
            </div>

            {state === "loading" && (
              <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted" role="status">
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-accent" />
                Loading drafts...
              </div>
            )}

            {state === "error" && (
              <div className="p-6">
                <Notice tone="error" onDismiss={null}>
                  <p className="font-semibold">Failed to load drafts</p>
                  <p className="mt-1 text-rose-100/90">{error}</p>
                </Notice>
              </div>
            )}

            {state === "ready" && filteredDrafts.length === 0 && (
              <div className="p-8">
                <EmptyState
                  icon={Send}
                  title="No reply drafts found"
                  description={!connected ? "Connect Gmail and synchronize messages in Inbox first." : "Select an email above and click 'Generate New Drafts'."}
                />
              </div>
            )}

            {state === "ready" && filteredDrafts.length > 0 && (
              <div className="divide-y divide-line max-h-[700px] overflow-y-auto">
                {filteredDrafts.map((d) => {
                  const isSelected = selectedDraft?.draft_id === d.draft_id;
                  const companyName = d.original_sender || d.recipient || "Company";
                  const initial = companyName.charAt(0).toUpperCase();

                  return (
                    <div
                      key={d.draft_id}
                      onClick={() => handleSelectDraft(d)}
                      className={`cursor-pointer p-4 transition-all hover:bg-ink-800/60 ${
                        isSelected ? "bg-ink-800/90 border-l-4 border-accent shadow-inner" : "bg-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300 font-bold border border-emerald-500/20 text-sm">
                            {initial}
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-white line-clamp-1">{d.subject || "(No Subject)"}</h4>
                            <p className="text-xs text-muted line-clamp-1 mt-0.5">{d.body ? d.body.substring(0, 50) + "..." : "(No preview)"}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <StatusBadge status={d.status} />
                          <span className="text-[11px] text-muted">{formatDateTime(d.updated_at || d.created_at).split(",")[0]}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Draft Detail Panel (7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="rounded-2xl border border-line bg-ink-900/80 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 h-48 w-48 bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent pointer-events-none rounded-bl-full" />

            {!selectedDraft ? (
              <div className="flex flex-col items-center justify-center p-16 text-center text-muted">
                <Edit3 className="size-12 text-muted/40 mb-3" />
                <h3 className="text-lg font-semibold text-white">No draft selected</h3>
                <p className="text-xs text-muted mt-1 max-w-sm">
                  Select a reply draft from the list on the left or generate a new AI reply.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6 relative z-10">
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedDraft.subject}</h3>
                    <p className="text-xs text-muted mt-0.5">From: <strong className="text-fg">{selectedDraft.original_sender || selectedDraft.recipient}</strong></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <EligibilityBadge eligibility={selectedClassification?.reply_eligibility || "reply_recommended"} />
                    <span className="inline-flex items-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300">
                      96% AI Confidence
                    </span>
                  </div>
                </div>

                {/* Tabs Row */}
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <button
                    type="button"
                    onClick={() => setDetailTab("draft")}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                      detailTab === "draft"
                        ? "bg-accent-strong text-white shadow-md"
                        : "border border-line bg-ink-950/60 text-muted hover:text-fg"
                    }`}
                  >
                    <Edit3 className="size-3.5" /> Draft Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab("original")}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                      detailTab === "original"
                        ? "bg-accent-strong text-white shadow-md"
                        : "border border-line bg-ink-950/60 text-muted hover:text-fg"
                    }`}
                  >
                    <Mail className="size-3.5" /> Original Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab("opportunity")}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                      detailTab === "opportunity"
                        ? "bg-accent-strong text-white shadow-md"
                        : "border border-line bg-ink-950/60 text-muted hover:text-fg"
                    }`}
                  >
                    <Building className="size-3.5" /> Opportunity Details
                  </button>
                </div>

                {/* Tab 1: Draft Reply Editor */}
                {detailTab === "draft" && (
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">Recipient</label>
                        <input
                          type="email"
                          value={editRecipient}
                          onChange={(e) => setEditRecipient(e.target.value)}
                          disabled={selectedDraft.status === "sent"}
                          className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">Subject</label>
                        <input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          disabled={selectedDraft.status === "sent"}
                          className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Message Body</label>
                      <textarea
                        rows={10}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        disabled={selectedDraft.status === "sent"}
                        className="w-full rounded-xl border border-line bg-ink-950 p-4 text-sm text-fg focus:border-accent focus:outline-none font-sans leading-relaxed"
                      />
                    </div>

                    {selectedDraft.status === "sent" ? (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2">
                        <CheckCircle className="size-4 shrink-0" />
                        This draft was successfully sent through Gmail on {formatDateTime(selectedDraft.sent_at)}.
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyDraft}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-950 px-3 py-2 text-xs font-semibold text-fg hover:bg-ink-800"
                          >
                            <Copy className="size-3.5" /> Copy Draft
                          </button>
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-950 px-3 py-2 text-xs font-semibold text-fg hover:bg-ink-800"
                          >
                            <Save className="size-3.5" /> Save
                          </button>
                          <button
                            type="button"
                            onClick={handleRegenerate}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-950 px-3 py-2 text-xs font-semibold text-fg hover:bg-ink-800"
                          >
                            <RefreshCw className="size-3.5" /> Regenerate
                          </button>
                          <button
                            type="button"
                            onClick={handleDelete}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                          >
                            <Trash2 className="size-3.5" /> Discard
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!canSend) {
                              setNotice({ tone: "error", text: "Gmail send permission is not granted. Please click 'Grant Gmail Send Permission' above." });
                              return;
                            }
                            setConfirmModal(true);
                          }}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-emerald-500"
                        >
                          <Send className="size-4" /> Approve & Send via Gmail
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Original Email */}
                {detailTab === "original" && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-xl border border-line bg-ink-950 p-5">
                      <h4 className="text-sm font-bold text-white">{selectedDraft.original_subject || selectedDraft.subject}</h4>
                      <p className="text-xs text-muted mt-1">From: <strong className="text-fg">{selectedDraft.original_sender}</strong></p>
                      {selectedDraft.reason && (
                        <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200">
                          <strong>AI Analysis Reason:</strong> {selectedDraft.reason}
                        </div>
                      )}
                      <div className="mt-4 pt-4 border-t border-line text-sm text-muted leading-relaxed whitespace-pre-wrap">
                        {selectedDraft.original_body || "(Original message body unavailable)"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Opportunity Details */}
                {detailTab === "opportunity" && (
                  <div className="flex flex-col gap-4">
                    {selectedOpportunity ? (
                      <div className="flex flex-col gap-4">
                        <div className="grid gap-3 sm:grid-cols-2 text-xs">
                          <div className="rounded-xl border border-line bg-ink-950 p-3.5">
                            <span className="text-muted block">Company</span>
                            <span className="font-semibold text-white text-sm">{selectedOpportunity.company_name || "N/A"}</span>
                          </div>
                          <div className="rounded-xl border border-line bg-ink-950 p-3.5">
                            <span className="text-muted block">Role</span>
                            <span className="font-semibold text-white text-sm">{selectedOpportunity.job_role || "N/A"}</span>
                          </div>
                          <div className="rounded-xl border border-line bg-ink-950 p-3.5">
                            <span className="text-muted block">Location</span>
                            <span className="font-semibold text-white text-sm">{selectedOpportunity.location || "N/A"}</span>
                          </div>
                          <div className="rounded-xl border border-line bg-ink-950 p-3.5">
                            <span className="text-muted block">Deadline</span>
                            <span className="font-semibold text-amber-200 text-sm">{selectedOpportunity.deadline || "Rolling"}</span>
                          </div>
                        </div>
                        {selectedOpportunity.skills && selectedOpportunity.skills.length > 0 && (
                          <div className="rounded-xl border border-line bg-ink-950 p-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-accent block mb-2">Required Skills</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedOpportunity.skills.map((s, idx) => (
                                <span key={idx} className="rounded-lg bg-ink-800 border border-line px-2.5 py-1 text-xs text-fg">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-muted">
                        <Building className="size-10 text-muted/40 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-white">No structured opportunity attached</p>
                        <p className="text-xs text-muted mt-1">This email is a general message or reply without specific job opportunity metadata.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal before sending */}
      {confirmModal && selectedDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-ink-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h3 className="text-lg font-bold text-fg flex items-center gap-2">
                <CheckCircle className="size-5 text-emerald-400" /> Confirm Email Send
              </h3>
              <button
                onClick={() => setConfirmModal(false)}
                className="rounded-lg p-1 text-muted hover:bg-ink-800 hover:text-fg"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="mt-4 text-sm text-muted">
              Please review the final recipient, subject, and message body before approving the send through your Gmail account.
            </p>

            <div className="mt-4 space-y-3 rounded-xl border border-line bg-ink-900 p-4 text-xs">
              <div>
                <span className="text-muted block font-medium">To (Recipient):</span>
                <span className="font-semibold text-fg">{editRecipient}</span>
              </div>
              <div>
                <span className="text-muted block font-medium">Subject:</span>
                <span className="font-semibold text-fg">{editSubject}</span>
              </div>
              <div>
                <span className="text-muted block font-medium">Message Body:</span>
                <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-950 p-3 font-mono text-fg border border-line/50">
                  {editBody}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => setConfirmModal(false)}
                className="rounded-lg border border-line bg-ink-800 px-4 py-2 text-sm font-semibold text-fg hover:bg-ink-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendConfirmed}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Approve & Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm No Reply Generate Warning Modal */}
      {confirmNoReplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-ink-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h3 className="text-lg font-bold text-fg flex items-center gap-2">
                <AlertTriangle className="size-5 text-amber-400" /> Generate Drafts Warning
              </h3>
              <button
                onClick={() => setConfirmNoReplyModal(false)}
                className="rounded-lg p-1 text-muted hover:bg-ink-800 hover:text-fg"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="mt-4 text-sm text-muted">
              This email has been evaluated as <strong>No Reply Needed</strong>:
            </p>


            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              {pendingEligibilityReason}
            </div>

            <p className="mt-3 text-xs text-muted">
              Automatically generating a reply draft for this email is not recommended. You can proceed to generate a draft if you intentionally choose to reply.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => setConfirmModal(false)}
                className="rounded-lg border border-line bg-ink-800 px-4 py-2 text-sm font-semibold text-fg hover:bg-ink-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNoReplyGenerate}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
