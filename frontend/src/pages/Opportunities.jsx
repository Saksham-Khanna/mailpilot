import { useCallback, useEffect, useState } from "react";
import { Filter, Loader2, RefreshCw, Sparkles, Target, Briefcase, Building, MapPin, DollarSign, Calendar, ExternalLink } from "lucide-react";
import Panel from "../components/Panel.jsx";
import Notice from "../components/Notice.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { formatDateTime, pluralize } from "../lib/format.js";
import { getClassifications, classifyEmails } from "../lib/api.js";

const CATEGORIES = [
  "All",
  "Job Opportunity",
  "Internship Opportunity",
  "Interview Invitation",
  "Application Update",
  "Rejection",
  "Assessment",
  "Recruiter Outreach",
  "Newsletter",
  "Other",
];

function PriorityBadge({ priority }) {
  const tones = {
    High: "bg-rose-400/10 text-rose-300 border-rose-400/30",
    Medium: "bg-amber-300/10 text-amber-200 border-amber-300/30",
    Low: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[priority] || tones.Medium}`}>
      {priority} Priority
    </span>
  );
}

function CategoryBadge({ category }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-ink-800 border border-line px-2.5 py-1 text-xs font-medium text-accent">
      {category}
    </span>
  );
}

export default function Opportunities({ gmail, health }) {
  const [category, setCategory] = useState("All");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const connected = Boolean(gmail?.status?.connected);

  const loadItems = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const activeCategory = category === "All" ? null : category;
      const data = await getClassifications({ category: activeCategory, limit: 50, offset: 0 });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
      setState("ready");
    } catch (err) {
      setError(err?.detail || err?.message || "Could not load classified opportunities.");
      setState("error");
    }
  }, [category]);

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
      await loadItems();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not classify emails." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {health?.state === "offline" && <ErrorBanner onRetry={health.retry} />}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Opportunities & Classifications</h2>
          <p className="mt-1 text-sm text-muted">
            AI-extracted job opportunities, internship offers, and interview invites from your synchronized inbox.
          </p>
        </div>
        {connected && (
          <button
            type="button"
            onClick={handleClassify}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:bg-ink-700 disabled:text-muted"
          >
            {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Sparkles aria-hidden="true" className="size-4" />}
            {busy ? "Classifying..." : "Classify Synchronized Emails"}
          </button>
        )}
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="flex flex-wrap gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              category === cat
                ? "bg-accent-strong text-white"
                : "border border-line bg-ink-800 text-muted hover:text-fg"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <Panel title={`Classified Messages (${total})`} icon={Target}>
        {state === "loading" && (
          <div className="flex items-center gap-2 p-8 text-sm text-muted" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
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
          <EmptyState
            icon={Target}
            title="No classified emails found"
            description={
              !connected
                ? "Connect Gmail in Inbox and synchronize messages first."
                : "Click “Classify Synchronized Emails” above to run AI classification on your synced emails."
            }
          />
        )}

        {state === "ready" && items.length > 0 && (
          <div className="divide-y divide-line">
            {items.map((item) => {
              const opp = item.opportunity;
              return (
                <div key={item.message_id} className="flex flex-col gap-3 p-5 transition-colors hover:bg-ink-900/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryBadge category={item.category} />
                      <PriorityBadge priority={item.priority} />
                      <span className="text-xs text-muted">Confidence: {Math.round(item.confidence * 100)}%</span>
                    </div>
                    {item.received_at && (
                      <span className="text-xs text-muted">{formatDateTime(item.received_at)}</span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-fg">{item.subject || "(No Subject)"}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      From: <span className="font-medium text-fg">{item.sender_name || item.sender_email}</span> ({item.sender_email})
                    </p>
                  </div>

                  <p className="text-sm text-muted">{item.summary}</p>

                  {opp && (
                    <div className="mt-2 rounded-xl border border-line bg-ink-900/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Extracted Opportunity Details</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-xs">
                        {opp.company_name && (
                          <div className="flex items-center gap-2">
                            <Building className="size-4 text-muted shrink-0" />
                            <div>
                              <span className="text-muted block">Company</span>
                              <span className="font-medium text-fg">{opp.company_name}</span>
                            </div>
                          </div>
                        )}
                        {opp.job_role && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="size-4 text-muted shrink-0" />
                            <div>
                              <span className="text-muted block">Role</span>
                              <span className="font-medium text-fg">{opp.job_role}</span>
                            </div>
                          </div>
                        )}
                        {opp.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="size-4 text-muted shrink-0" />
                            <div>
                              <span className="text-muted block">Location</span>
                              <span className="font-medium text-fg">{opp.location} ({opp.work_mode || "Remote/On-site"})</span>
                            </div>
                          </div>
                        )}
                        {opp.salary && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="size-4 text-muted shrink-0" />
                            <div>
                              <span className="text-muted block">Salary / Package</span>
                              <span className="font-medium text-fg">{opp.salary}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {opp.skills && opp.skills.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-line/50 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted mr-1">Skills:</span>
                          {opp.skills.map((skill, idx) => (
                            <span key={idx} className="rounded-md bg-ink-800 px-2 py-0.5 text-xs text-fg">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}

                      {opp.application_link && (
                        <div className="mt-3 pt-3 border-t border-line/50 flex items-center justify-between">
                          {opp.deadline && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                              <Calendar className="size-3.5" /> Deadline: {opp.deadline}
                            </span>
                          )}
                          <a
                            href={opp.application_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline ml-auto"
                          >
                            Application Link <ExternalLink className="size-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
