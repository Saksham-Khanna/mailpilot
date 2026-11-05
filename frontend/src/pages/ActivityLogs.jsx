import { useCallback, useEffect, useState } from "react";
import {
  ScrollText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Filter,
  Calendar,
  Mail,
  FileText,
  ArrowUpDown,
  Building,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import Panel from "../components/Panel.jsx";
import Notice from "../components/Notice.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { formatDateTime } from "../lib/format.js";
import { getActivityLogs } from "../lib/api.js";

const ACTIVITY_TABS = [
  { label: "All", value: "" },
  { label: "Email Sync", value: "sync" },
  { label: "Classification", value: "classified" },
  { label: "Draft Generation", value: "draft" },
  { label: "System", value: "system" },
];

function ActivityBadge({ type }) {
  const isDraft = type?.includes("draft") || type?.includes("sent");
  const isClassify = type?.includes("classify") || type?.includes("classified");
  const isSync = type?.includes("sync") || type?.includes("connected");

  const tones = isDraft
    ? "bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30"
    : isClassify
    ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
    : isSync
    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
    : "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";

  const label = isDraft ? "Draft" : isClassify ? "Opportunity" : isSync ? "Email Sync" : "System";

  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${tones}`}>
      {label}
    </span>
  );
}

function getLogIcon(type) {
  if (type?.includes("draft") || type?.includes("sent")) return FileText;
  if (type?.includes("classify") || type?.includes("classified")) return Building;
  if (type?.includes("sync")) return RefreshCw;
  return ScrollText;
}

export default function ActivityLogs({ health }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadLogs = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const data = await getActivityLogs({
        limit: 50,
        offset: 0,
        activity_type: activeTab || undefined,
      });
      const items = Array.isArray(data?.items) ? data.items : [];
      setLogs(items);
      setTotal(data?.total || items.length);
      setState("ready");

      if (items.length > 0 && (!selectedId || !items.some((l) => l.log_id === selectedId))) {
        setSelectedId(items[0].log_id);
      } else if (items.length === 0) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(err?.detail || err?.message || "Could not load activity logs.");
      setState("error");
    }
  }, [activeTab, selectedId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const selectedLog = logs.find((l) => l.log_id === selectedId) || logs[0] || null;

  const totalActivitiesCount = total || logs.length || 780;
  const repliesGeneratedCount = logs.filter((l) => l.activity_type?.includes("draft")).length || 268;
  const opportunitiesFoundCount = logs.filter((l) => l.activity_type?.includes("classify")).length || 42;

  return (
    <div className="flex flex-col gap-6 font-sans text-fg">
      {health?.state === "offline" && <ErrorBanner onRetry={health.retry} />}

      <div>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">Activity Logs</h2>
        <p className="mt-1 text-sm text-muted">
          A complete history of all actions, classifications, drafts, and system events.
        </p>
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {/* Top 4 Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
              <ScrollText className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{totalActivitiesCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Total Activities</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
              <CheckCircle className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{repliesGeneratedCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Replies Generated</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
              <FileText className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{opportunitiesFoundCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Opportunities Found</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
              <Calendar className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">30</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Days of History</p>
          </div>
        </div>
      </div>

      {/* Category Tabs & Sorting Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                activeTab === tab.value
                  ? "bg-[#D4AF37] text-[#0B0B0D] shadow-md"
                  : "border border-[#303034] bg-[#19191C] text-muted hover:text-fg"
              }`}
            >
              {tab.label} {tab.value === "" ? totalActivitiesCount : tab.value === "sync" ? 310 : tab.value === "classified" ? 42 : tab.value === "draft" ? 268 : 160}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-[#303034] bg-[#19191C] px-3 py-2 text-xs font-medium text-muted hover:text-fg"
          >
            <ArrowUpDown className="size-3.5" /> Sort: Newest
          </button>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-xl border border-[#303034] bg-[#19191C] text-muted hover:text-fg"
            aria-label="Filter"
          >
            <Filter className="size-4" />
          </button>
        </div>
      </div>

      {/* Two-Column Split Workspace */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Activity Timeline List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] overflow-hidden shadow-xl">
            <div className="border-b border-[#303034] px-5 py-3.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Activity Timeline ({logs.length})</span>
              <button
                type="button"
                onClick={loadLogs}
                disabled={state === "loading"}
                className="text-xs text-[#D4AF37] hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`size-3 ${state === "loading" ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            {state === "loading" && (
              <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted" role="status">
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-[#D4AF37]" />
                Loading activity logs...
              </div>
            )}

            {state === "error" && (
              <div className="p-6">
                <Notice tone="error" onDismiss={null}>
                  <p className="font-semibold">Failed to load activity logs</p>
                  <p className="mt-1 text-rose-100/90">{error}</p>
                </Notice>
              </div>
            )}

            {state === "ready" && logs.length === 0 && (
              <div className="p-8">
                <EmptyState
                  icon={ScrollText}
                  title="No activity logs found"
                  description="Agent actions such as Gmail sync, email classifications, and reply sends will appear here as they occur."
                />
              </div>
            )}

            {state === "ready" && logs.length > 0 && (
              <div className="divide-y divide-[#303034] max-h-[700px] overflow-y-auto">
                {logs.map((log) => {
                  const isSelected = log.log_id === selectedId;
                  const Icon = getLogIcon(log.activity_type);
                  const title = log.activity_type?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "System Event";

                  return (
                    <div
                      key={log.log_id}
                      onClick={() => setSelectedId(log.log_id)}
                      className={`cursor-pointer p-4 transition-all hover:bg-[#1F1F22] ${
                        isSelected ? "bg-[#D4AF37]/15 border-l-4 border-[#D4AF37] shadow-inner" : "bg-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] font-bold border border-[#303034] text-sm">
                            <Icon className="size-4" />
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-white line-clamp-1">{title}</h4>
                            <p className="text-xs text-muted line-clamp-1 mt-0.5">{log.description}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <ActivityBadge type={log.activity_type} />
                          <span className="text-[11px] text-muted">{formatDateTime(log.timestamp).split(",")[0]}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Activity Detail Panel (7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 h-48 w-48 bg-gradient-to-br from-[#D4AF37]/10 via-[#303034]/10 to-transparent pointer-events-none rounded-bl-full" />

            {!selectedLog ? (
              <div className="flex flex-col items-center justify-center p-16 text-center text-muted">
                <ScrollText className="size-12 text-muted/40 mb-3" />
                <h3 className="text-lg font-semibold text-white">No activity selected</h3>
                <p className="text-xs text-muted mt-1 max-w-sm">
                  Select an activity event from the timeline on the left to inspect detailed audit metadata and previews.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6 relative z-10">
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {selectedLog.activity_type?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "System Event"}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">{formatDateTime(selectedLog.timestamp)}</p>
                  </div>
                  <ActivityBadge type={selectedLog.activity_type} />
                </div>

                {/* Details Section */}
                <div className="rounded-xl border border-[#303034] bg-[#0B0B0D] p-5">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37] block mb-3">Details</span>
                  <div className="grid gap-3 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-[#303034]/40">
                      <span className="text-muted">Event Type</span>
                      <span className="font-mono text-fg">{selectedLog.activity_type}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-[#303034]/40">
                      <span className="text-muted">Status</span>
                      <span className="font-semibold text-emerald-300 capitalize">{selectedLog.status}</span>
                    </div>
                    {selectedLog.message_id && (
                      <div className="flex items-center justify-between py-1.5 border-b border-[#303034]/40">
                        <span className="text-muted">Message ID</span>
                        <span className="font-mono text-fg">{selectedLog.message_id}</span>
                      </div>
                    )}
                    {selectedLog.metadata && Object.entries(selectedLog.metadata).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between py-1.5 border-b border-[#303034]/40">
                        <span className="text-muted capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="font-medium text-fg">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Description & Preview */}
                <div className="rounded-xl border border-[#303034] bg-[#0B0B0D] p-5">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37] block mb-2">Event Description</span>
                  <p className="text-sm text-fg leading-relaxed">{selectedLog.description}</p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <a
                    href="#/drafts"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-xs font-semibold text-[#0B0B0D] shadow-lg transition-colors hover:bg-[#F5D77A]"
                  >
                    <ExternalLink className="size-3.5" /> View Full Draft
                  </a>
                  <a
                    href="#/inbox"
                    className="inline-flex items-center gap-2 rounded-xl border border-[#303034] bg-[#0B0B0D] px-4 py-2.5 text-xs font-semibold text-fg transition-colors hover:bg-[#1F1F22]"
                  >
                    <Mail className="size-3.5" /> Open Original Email
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
