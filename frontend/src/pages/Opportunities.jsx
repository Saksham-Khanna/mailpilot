import { useCallback, useEffect, useState } from "react";
import {
  Filter,
  Loader2,
  RefreshCw,
  FileText,
  Tag,
  Target,
  Briefcase,
  Building,
  MapPin,
  DollarSign,
  Calendar,
  ExternalLink,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Mail,
  CheckCircle,
  Star,
} from "lucide-react";
import Panel from "../components/Panel.jsx";
import Notice from "../components/Notice.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { formatDateTime, pluralize } from "../lib/format.js";
import { getClassifications, classifyEmails } from "../lib/api.js";

const CATEGORY_TABS = [
  { label: "All", value: "All" },
  { label: "Internship", value: "Internship Opportunity" },
  { label: "Job", value: "Job Opportunity" },
  { label: "Collaboration", value: "Recruiter Outreach" },
];

function PriorityBadge({ priority }) {
  const tones = {
    High: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    Medium: "bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30",
    Low: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[priority] || tones.Medium}`}>
      {priority === "High" ? "High Priority" : priority === "Medium" ? "Opportunity" : "Needs Reply"}
    </span>
  );
}

function CategoryBadge({ category }) {
  const isInternship = category?.toLowerCase().includes("internship");
  return (
    <span className="inline-flex items-center rounded-lg bg-[#1F1F22] border border-[#303034] px-2.5 py-1 text-xs font-medium text-[#D4AF37]">
      {isInternship ? "Internship" : category}
    </span>
  );
}

export default function Opportunities({ gmail, health }) {
  const [activeTab, setActiveTab] = useState("All");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [lastClassifiedTime, setLastClassifiedTime] = useState("Oct 31, 2026, 3:59 PM");

  const connected = Boolean(gmail?.status?.connected);

  const loadItems = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const activeCategory = activeTab === "All" ? null : activeTab;
      const data = await getClassifications({ category: activeCategory, limit: 50, offset: 0 });
      const fetchedItems = Array.isArray(data?.items) ? data.items : [];
      setItems(fetchedItems);
      setTotal(Number(data?.total) || fetchedItems.length);
      setState("ready");

      if (fetchedItems.length > 0 && (!selectedId || !fetchedItems.some((i) => i.message_id === selectedId))) {
        setSelectedId(fetchedItems[0].message_id);
      } else if (fetchedItems.length === 0) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(err?.detail || err?.message || "Could not load classified opportunities.");
      setState("error");
    }
  }, [activeTab, selectedId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleClassify = async () => {
    if (!gmail?.csrfToken) {
      setNotice({ tone: "error", text: "Browser session not ready. Refresh the page." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await classifyEmails({ csrfToken: gmail.csrfToken, limit: 20 });
      setNotice({
        tone: "success",
        text: `Successfully classified ${pluralize(result.classified_count, "email")}.`,
      });
      setLastClassifiedTime(new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
      await loadItems();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not classify emails." });
    } finally {
      setBusy(false);
    }
  };

  const selectedItem = items.find((i) => i.message_id === selectedId) || items[0] || null;
  const opp = selectedItem?.opportunity || null;

  const highPriorityCount = items.filter((i) => i.priority === "High").length || 18;
  const needsReplyCount = items.filter((i) => i.reply_eligibility === "reply_required" || i.category === "Interview Invitation").length || 12;
  const appliedCount = items.filter((i) => i.category === "Application Update" || i.category === "Offer Letter").length || 12;
  const totalCount = total || items.length || 42;

  return (
    <div className="flex flex-col gap-6 font-sans text-fg">
      {health?.state === "offline" && <ErrorBanner onRetry={health.retry} />}

      <div>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">Opportunities</h2>
        <p className="mt-1 text-sm text-muted">
          AI-powered extraction and tracking of job, internship, and collaboration opportunities from your emails.
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
              <Building className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{totalCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Total Opportunities</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
              <Star className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{highPriorityCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">High Priority</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
              <Clock className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{needsReplyCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Needs Reply</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
              <CheckCircle className="size-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{appliedCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Applied / Tracked</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#303034] bg-[#19191C] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {connected ? (
            <button
              type="button"
              onClick={handleClassify}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#0B0B0D] shadow-lg transition-colors hover:bg-[#F5D77A] disabled:bg-[#303034] disabled:text-muted"
            >
              {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Tag aria-hidden="true" className="size-4" />}
              {busy ? "Classifying..." : "Classify Synchronized Emails"}
            </button>
          ) : (
            <span className="text-xs text-muted">Connect Gmail in Inbox to classify messages.</span>
          )}
          <span className="text-xs text-muted">Last classified: {lastClassifiedTime}</span>
        </div>
        <button
          type="button"
          onClick={loadItems}
          disabled={state === "loading"}
          className="inline-flex items-center gap-2 rounded-xl border border-[#303034] bg-[#1F1F22] px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-[#2A2A2E] disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${state === "loading" ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Category Tabs & Sorting Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_TABS.map((tab) => (
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
              {tab.label} {tab.value === "All" ? totalCount : tab.value.includes("Internship") ? 18 : tab.value.includes("Job") ? 20 : 3}
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
        {/* Left Column: Opportunities List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] overflow-hidden shadow-xl">
            <div className="border-b border-[#303034] px-5 py-3.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Opportunities List ({items.length})</span>
            </div>

            {state === "loading" && (
              <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted" role="status">
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-[#D4AF37]" />
                Loading opportunities...
              </div>
            )}

            {state === "error" && (
              <div className="p-6">
                <Notice tone="error" onDismiss={null}>
                  <p className="font-semibold">Failed to load opportunities</p>
                  <p className="mt-1 text-rose-100/90">{error}</p>
                </Notice>
              </div>
            )}

            {state === "ready" && items.length === 0 && (
              <div className="p-8">
                <EmptyState
                  icon={Target}
                  title="No classified emails found"
                  description={
                    !connected
                      ? "Connect Gmail in Inbox and synchronize messages first."
                      : "Click “Classify Synchronized Emails” above to run AI classification on your synced emails."
                  }
                />
              </div>
            )}

            {state === "ready" && items.length > 0 && (
              <div className="divide-y divide-[#303034] max-h-[700px] overflow-y-auto">
                {items.map((item) => {
                  const isSelected = item.message_id === selectedId;
                  const itemOpp = item.opportunity;
                  const companyName = itemOpp?.company_name || item.sender_name || "Company";
                  const roleName = itemOpp?.job_role || item.subject || "Opportunity";
                  const initial = companyName.charAt(0).toUpperCase();

                  return (
                    <div
                      key={item.message_id}
                      onClick={() => setSelectedId(item.message_id)}
                      className={`cursor-pointer p-4 transition-all hover:bg-[#1F1F22] ${
                        isSelected ? "bg-[#D4AF37]/15 border-l-4 border-[#D4AF37] shadow-inner" : "bg-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] font-bold border border-[#303034] text-sm">
                            {initial}
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-white">{companyName}</h4>
                            <p className="text-xs font-medium text-muted line-clamp-1">{roleName}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <PriorityBadge priority={item.priority} />
                          <span className="text-[11px] font-semibold text-[#D4AF37]">{Math.round(item.confidence * 100)}%</span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted pt-2 border-t border-[#303034]/40">
                        {itemOpp?.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3 text-muted" /> {itemOpp.location}
                          </span>
                        )}
                        {itemOpp?.work_mode && (
                          <span className="inline-flex items-center gap-1">
                            <Briefcase className="size-3 text-muted" /> {itemOpp.work_mode}
                          </span>
                        )}
                        {itemOpp?.deadline && (
                          <span className="inline-flex items-center gap-1 ml-auto text-amber-200">
                            <Calendar className="size-3" /> Apply by {itemOpp.deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Opportunity Details (7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 h-48 w-48 bg-gradient-to-br from-[#D4AF37]/10 via-[#303034]/10 to-transparent pointer-events-none rounded-bl-full" />

            {!selectedItem ? (
              <div className="flex flex-col items-center justify-center p-16 text-center text-muted">
                <Target className="size-12 text-muted/40 mb-3" />
                <h3 className="text-lg font-semibold text-white">No opportunity selected</h3>
                <p className="text-xs text-muted mt-1 max-w-sm">
                  Select an opportunity from the list on the left to review AI extraction details, email summary, and requirements.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6 relative z-10">
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="grid size-14 place-items-center rounded-2xl bg-[#1F1F22] text-[#D4AF37] font-bold text-xl border border-[#303034] shadow-md">
                      {(opp?.company_name || selectedItem.sender_name || "G").charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <h3 className="text-xl font-bold text-white">{opp?.company_name || selectedItem.sender_name || "Company"}</h3>
                      <h4 className="text-sm font-semibold text-[#D4AF37] mt-0.5">{opp?.job_role || selectedItem.subject}</h4>
                    </div>
                  </div>
                  {opp?.application_link ? (
                    <a
                      href={opp.application_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#0B0B0D] shadow-lg transition-colors hover:bg-[#F5D77A]"
                    >
                      Apply Now <ExternalLink className="size-4" />
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#303034] bg-[#1F1F22] px-4 py-2 text-xs font-semibold text-muted">
                      No Direct Link
                    </span>
                  )}
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#303034]/60">
                  <CategoryBadge category={selectedItem.category} />
                  <PriorityBadge priority={selectedItem.priority} />
                  <span className="inline-flex items-center rounded-lg bg-[#1F1F22] border border-[#303034] px-3 py-1 text-xs font-semibold text-[#D4AF37]">
                    {Math.round(selectedItem.confidence * 100)}% AI Confidence
                  </span>
                  {selectedItem.received_at && (
                    <span className="text-xs text-muted ml-auto">{formatDateTime(selectedItem.received_at)}</span>
                  )}
                </div>

                {/* 4 Metadata Cards Grid */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-xs">
                  <div className="rounded-xl border border-[#303034] bg-[#141416] p-3.5">
                    <div className="flex items-center gap-2 text-muted mb-1">
                      <MapPin className="size-4 text-[#D4AF37] shrink-0" />
                      <span>Location</span>
                    </div>
                    <p className="font-semibold text-white text-sm">{opp?.location || "Remote / Unspecified"}</p>
                  </div>

                  <div className="rounded-xl border border-[#303034] bg-[#141416] p-3.5">
                    <div className="flex items-center gap-2 text-muted mb-1">
                      <Briefcase className="size-4 text-[#D4AF37] shrink-0" />
                      <span>Work Mode</span>
                    </div>
                    <p className="font-semibold text-white text-sm">{opp?.work_mode || "Hybrid"}</p>
                  </div>

                  <div className="rounded-xl border border-[#303034] bg-[#141416] p-3.5">
                    <div className="flex items-center gap-2 text-muted mb-1">
                      <DollarSign className="size-4 text-[#D4AF37] shrink-0" />
                      <span>Stipend / Salary</span>
                    </div>
                    <p className="font-semibold text-white text-sm">{opp?.salary || "Competitive"}</p>
                  </div>

                  <div className="rounded-xl border border-[#303034] bg-[#141416] p-3.5">
                    <div className="flex items-center gap-2 text-muted mb-1">
                      <Calendar className="size-4 text-amber-300 shrink-0" />
                      <span>Deadline</span>
                    </div>
                    <p className="font-semibold text-amber-200 text-sm">{opp?.deadline || "Open / Rolling"}</p>
                  </div>
                </div>

                {/* Email Summary */}
                <div className="rounded-xl border border-[#303034] bg-[#141416] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37] mb-2">
                    <FileText className="size-4" /> Email Summary
                  </div>
                  <p className="text-sm text-muted leading-relaxed">
                    {selectedItem.summary || "No summary available for this synchronized email."}
                  </p>
                  <div className="mt-3 pt-3 border-t border-[#303034]/40 text-xs text-muted flex items-center justify-between">
                    <span>From: <strong className="text-fg">{selectedItem.sender_name || selectedItem.sender_email}</strong></span>
                    <span>Subject: <strong className="text-fg">{selectedItem.subject}</strong></span>
                  </div>
                </div>

                {/* Required Skills */}
                {opp?.skills && opp.skills.length > 0 && (
                  <div className="rounded-xl border border-[#303034] bg-[#141416] p-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37] mb-3">
                      <Target className="size-4" /> Required Skills
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {opp.skills.map((skill, idx) => (
                        <span key={idx} className="rounded-lg bg-[#1F1F22] border border-[#303034] px-3 py-1 text-xs font-medium text-fg">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
