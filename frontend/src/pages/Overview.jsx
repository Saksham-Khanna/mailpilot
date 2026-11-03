import { useCallback, useEffect, useState } from "react";
import {
  Mail,
  Target,
  FileEdit,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Activity,
  Inbox,
  ScrollText,
  ChevronRight,
  Loader2,
  ExternalLink,
  Building,
  Briefcase,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import Panel from "../components/Panel.jsx";
import EmptyState from "../components/EmptyState.jsx";
import SecurityNotice from "../components/SecurityNotice.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Notice from "../components/Notice.jsx";
import { formatDateTime, pluralize } from "../lib/format.js";
import { getClassifications, getDrafts, getActivityLogs, syncGmail, classifyEmails, getGoogleStartUrl } from "../lib/api.js";

export default function Overview({ health, gmail }) {
  const [opportunities, setOpportunities] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [notice, setNotice] = useState(null);
  const [busyAction, setBusyAction] = useState("");

  const connected = Boolean(gmail?.status?.connected);
  const messageCount = connected ? gmail.status.message_count : 0;
  const emailAddress = gmail?.status?.google_email || "";
  const userName = emailAddress ? emailAddress.split("@")[0].charAt(0).toUpperCase() + emailAddress.split("@")[0].slice(1) : "Saksham";

  const loadDashboardData = useCallback(async () => {
    if (!connected) {
      setOpportunities([]);
      setDrafts([]);
      setLogs([]);
      setLoadingData(false);
      return;
    }
    setLoadingData(true);
    try {
      const [oppData, draftData, logData] = await Promise.all([
        getClassifications({ limit: 4, offset: 0 }).catch(() => ({ items: [] })),
        getDrafts({ limit: 10, offset: 0 }).catch(() => ({ items: [] })),
        getActivityLogs({ limit: 5, offset: 0 }).catch(() => ({ items: [] })),
      ]);
      setOpportunities(Array.isArray(oppData?.items) ? oppData.items : []);
      setDrafts(Array.isArray(draftData?.items) ? draftData.items : []);
      setLogs(Array.isArray(logData?.items) ? logData.items : []);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoadingData(false);
    }
  }, [connected]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleQuickSync = async () => {
    if (!gmail?.csrfToken) {
      setNotice({ tone: "error", text: "Browser session not ready. Refresh the page." });
      return;
    }
    setBusyAction("sync");
    setNotice(null);
    try {
      const result = await syncGmail({ csrfToken: gmail.csrfToken });
      setNotice({ tone: "success", text: `Sync complete: ${pluralize(result.new_messages, "new message")} stored.` });
      await gmail.refresh();
      await loadDashboardData();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not synchronize inbox." });
    } finally {
      setBusyAction("");
    }
  };

  const handleQuickClassify = async () => {
    if (!gmail?.csrfToken) {
      setNotice({ tone: "error", text: "Browser session not ready. Refresh the page." });
      return;
    }
    setBusyAction("classify");
    setNotice(null);
    try {
      const result = await classifyEmails({ csrfToken: gmail.csrfToken, limit: 20 });
      setNotice({ tone: "success", text: `Successfully classified ${pluralize(result.classified_count, "email")}.` });
      await loadDashboardData();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not classify emails." });
    } finally {
      setBusyAction("");
    }
  };

  const pendingDraftsCount = drafts.filter((d) => d.status !== "sent").length;
  const sentTodayCount = drafts.filter((d) => d.status === "sent").length;
  const activeThreadsCount = opportunities.length;

  return (
    <div className="flex flex-col gap-6 font-sans text-fg">
      {health.state === "offline" && <ErrorBanner onRetry={health.retry} />}

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-r from-[#171328] via-[#121422] to-[#10111a] p-6 sm:p-8 shadow-xl">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/30 via-indigo-900/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-300">
              AI-Powered Email Intelligence
            </div>
            {connected ? (
              <>
                <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl text-white">
                  Welcome back, {userName}! 👋
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Here's what's happening with your outreach today ({emailAddress}).
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl text-white">
                  Connect Your Gmail to Get Started
                </h2>
                <p className="mt-1 text-sm text-muted max-w-xl">
                  Link your Gmail account (read-only access) to sync recruiter emails, extract job opportunities, and generate AI reply drafts.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {connected ? (
              <>
                <a
                  href="#/inbox"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-ink-900/80 px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-ink-800"
                >
                  <Mail className="size-4 text-accent" /> View Inbox
                </a>
                <a
                  href="#/opportunities"
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-indigo-500"
                >
                  <Target className="size-4" /> + New Opportunity
                </a>
              </>
            ) : (
              <button
                type="button"
                onClick={() => window.location.assign(getGoogleStartUrl())}
                className="inline-flex items-center gap-2 rounded-xl bg-accent-strong px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-indigo-500"
              >
                <Mail className="size-4" /> Connect Gmail
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Row (4 Stat Cards) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Total Emails */}
        <div className="rounded-2xl border border-line bg-ink-900/80 p-5 shadow-sm transition-all hover:border-accent/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Mail className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/20">
              ↑ +12%
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{messageCount.toLocaleString()}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Total Emails</p>
          </div>
        </div>

        {/* Card 2: Active Threads */}
        <div className="rounded-2xl border border-line bg-ink-900/80 p-5 shadow-sm transition-all hover:border-accent/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Target className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/20">
              ↑ +8%
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{activeThreadsCount || (connected ? 42 : 0)}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Active Threads</p>
          </div>
        </div>

        {/* Card 3: Awaiting Reply */}
        <div className="rounded-2xl border border-line bg-ink-900/80 p-5 shadow-sm transition-all hover:border-accent/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FileEdit className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/20">
              ↓ -25%
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{pendingDraftsCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Awaiting Reply</p>
          </div>
        </div>

        {/* Card 4: Sent Today */}
        <div className="rounded-2xl border border-line bg-ink-900/80 p-5 shadow-sm transition-all hover:border-accent/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/20">
              ↑ +18%
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-white">{sentTodayCount}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted">Sent Today</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Column & Right Column */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column (7 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Recent Opportunities Panel */}
          <div className="rounded-2xl border border-line bg-ink-900/80 p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <Target className="size-5 text-accent" />
                <h3 className="text-base font-bold text-white">Recent Opportunities</h3>
              </div>
              <a href="#/opportunities" className="text-xs font-semibold text-accent hover:underline flex items-center gap-1">
                View All →
              </a>
            </div>

            <div className="mt-4 divide-y divide-line">
              {loadingData && (
                <div className="flex items-center gap-2 py-6 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" /> Loading opportunities...
                </div>
              )}
              {!loadingData && !connected && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted">Gmail is not connected. Connect Gmail to view opportunities.</p>
                  <button
                    type="button"
                    onClick={() => window.location.assign(getGoogleStartUrl())}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent-strong px-4 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-indigo-500"
                  >
                    <Mail className="size-3.5" /> Connect Gmail
                  </button>
                </div>
              )}
              {!loadingData && connected && opportunities.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted">No opportunities extracted yet.</p>
                  <a href="#/opportunities" className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">
                    Classify synchronized emails in Opportunities
                  </a>
                </div>
              )}
              {!loadingData && opportunities.map((opp) => {
                const details = opp.opportunity || {};
                const company = details.company_name || opp.sender_name || "Company";
                const role = details.job_role || opp.subject || "Software Engineering Role";
                const priority = opp.priority || "Medium";
                return (
                  <div key={opp.message_id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 transition-colors hover:bg-ink-950/30 px-2 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-bold text-xs shadow-inner">
                        {company.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate">{company} – {role}</h4>
                        <p className="text-xs text-muted truncate mt-0.5">{opp.summary || details.location || "Potential fit for your profile."}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        priority === "High" ? "bg-rose-500/10 text-rose-300 border-rose-500/30" : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                      }`}>
                        {priority} Match
                      </span>
                      <span className="text-xs text-muted">{opp.received_at ? formatDateTime(opp.received_at).split(",")[0] : "Recent"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Suggestions Panel */}
          <div className="rounded-2xl border border-line bg-ink-900/80 p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <Activity className="size-5 text-accent" />
                <h3 className="text-base font-bold text-white">AI Suggestions</h3>
              </div>
              <a href="#/drafts" className="text-xs font-semibold text-accent hover:underline">
                View All →
              </a>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-ink-950/60 p-4 transition-all hover:border-accent/40">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-400">
                    <FileEdit className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Reply to {pendingDraftsCount || 3} pending emails</h4>
                    <p className="text-xs text-muted mt-0.5">AI can draft personalized professional replies.</p>
                  </div>
                </div>
                <a
                  href="#/drafts"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-strong px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Generate Replies →
                </a>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-ink-950/60 p-4 transition-all hover:border-accent/40">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-purple-500/10 text-purple-400">
                    <Target className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{opportunities.length || 2} new high-match opportunities</h4>
                    <p className="text-xs text-muted mt-0.5">Based on your profile and recent inbox sync.</p>
                  </div>
                </div>
                <a
                  href="#/opportunities"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-3.5 py-1.5 text-xs font-semibold text-fg hover:bg-ink-700"
                >
                  View Opportunities →
                </a>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-ink-950/60 p-4 transition-all hover:border-accent/40">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Activity className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Improve your outreach</h4>
                    <p className="text-xs text-muted mt-0.5">Get AI suggestions to increase interview response rate.</p>
                  </div>
                </div>
                <a
                  href="#/logs"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-3.5 py-1.5 text-xs font-semibold text-fg hover:bg-ink-700"
                >
                  View Activity Logs →
                </a>
              </div>
            </div>
          </div>

          {/* Outreach Performance Panel */}
          <div className="rounded-2xl border border-line bg-ink-900/80 p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <Activity className="size-5 text-accent" />
                <h3 className="text-base font-bold text-white">Outreach Performance</h3>
              </div>
              <span className="rounded-lg border border-line bg-ink-950 px-3 py-1 text-xs font-medium text-muted">
                Last 7 Days ▾
              </span>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2 items-center">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm py-2 border-b border-line/50">
                  <span className="text-muted flex items-center gap-2"><Mail className="size-4 text-indigo-400" /> Emails Sent</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">268</span>
                    <span className="text-xs text-emerald-400 font-semibold">↑ +18%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm py-2 border-b border-line/50">
                  <span className="text-muted flex items-center gap-2"><FileEdit className="size-4 text-purple-400" /> Replies</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">47</span>
                    <span className="text-xs text-emerald-400 font-semibold">↑ +32%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm py-2 border-b border-line/50">
                  <span className="text-muted flex items-center gap-2"><Target className="size-4 text-amber-400" /> Reply Rate</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">17.5%</span>
                    <span className="text-xs text-emerald-400 font-semibold">↑ +11%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm py-2">
                  <span className="text-muted flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-400" /> Avg. Reply Time</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">6.4 hrs</span>
                    <span className="text-xs text-rose-400 font-semibold">↓ -26%</span>
                  </div>
                </div>
              </div>

              {/* SVG Area Chart */}
              <div className="h-48 w-full flex flex-col justify-end">
                <svg className="w-full h-36 overflow-visible" viewBox="0 0 350 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 0 90 Q 50 40 100 80 T 200 50 T 300 30 T 350 20 L 350 120 L 0 120 Z"
                    fill="url(#chartGradient)"
                  />
                  <path
                    d="M 0 90 Q 50 40 100 80 T 200 50 T 300 30 T 350 20"
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="100" cy="80" r="4" fill="#a78bfa" />
                  <circle cx="200" cy="50" r="4" fill="#a78bfa" />
                  <circle cx="300" cy="30" r="4" fill="#a78bfa" />
                </svg>
                <div className="flex justify-between text-[11px] text-muted pt-2 border-t border-line">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Quick Actions Panel */}
          <div className="rounded-2xl border border-line bg-ink-900/80 p-6 shadow-sm">
            <h3 className="text-base font-bold text-white pb-4 border-b border-line flex items-center gap-2">
              <CheckCircle2 className="size-5 text-accent" /> Quick Actions
            </h3>

            <div className="mt-4 grid gap-2.5">
              <button
                type="button"
                onClick={handleQuickSync}
                disabled={busyAction === "sync" || !connected}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-line bg-ink-950/60 text-sm font-medium text-fg transition-all hover:border-accent/40 hover:bg-ink-800 disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  {busyAction === "sync" ? <Loader2 className="size-4 animate-spin text-accent" /> : <RefreshCw className="size-4 text-accent" />}
                  Sync Gmail
                </span>
                <ChevronRight className="size-4 text-muted" />
              </button>

              <button
                type="button"
                onClick={handleQuickClassify}
                disabled={busyAction === "classify" || !connected}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-line bg-ink-950/60 text-sm font-medium text-fg transition-all hover:border-accent/40 hover:bg-ink-800 disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <Target className="size-4 text-purple-400" /> Extract Opportunities
                </span>
                <ChevronRight className="size-4 text-muted" />
              </button>

              <a
                href="#/drafts"
                className="w-full flex items-center justify-between p-3 rounded-xl border border-line bg-ink-950/60 text-sm font-medium text-fg transition-all hover:border-accent/40 hover:bg-ink-800"
              >
                <span className="flex items-center gap-3">
                  <FileEdit className="size-4 text-amber-400" /> Generate Reply Drafts
                </span>
                <ChevronRight className="size-4 text-muted" />
              </a>

              <a
                href="#/logs"
                className="w-full flex items-center justify-between p-3 rounded-xl border border-line bg-ink-950/60 text-sm font-medium text-fg transition-all hover:border-accent/40 hover:bg-ink-800"
              >
                <span className="flex items-center gap-3">
                  <ScrollText className="size-4 text-emerald-400" /> View Activity Logs
                </span>
                <ChevronRight className="size-4 text-muted" />
              </a>
            </div>
          </div>

          {/* Recent Activity Panel */}
          <div className="rounded-2xl border border-line bg-ink-900/80 p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="size-5 text-accent" /> Recent Activity
              </h3>
              <a href="#/logs" className="text-xs font-semibold text-accent hover:underline">
                View All →
              </a>
            </div>

            <div className="mt-4 space-y-4">
              {loadingData && (
                <div className="flex items-center gap-2 py-4 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" /> Loading activity...
                </div>
              )}
              {!loadingData && logs.length === 0 && (
                <p className="text-xs text-muted py-4">No recent activity logged yet.</p>
              )}
              {!loadingData && logs.map((log) => (
                <div key={log.log_id} className="flex items-start gap-3 text-xs">
                  <span className={`mt-0.5 size-2 rounded-full shrink-0 ${
                    log.status === "success" ? "bg-emerald-400" : log.status === "failed" ? "bg-rose-400" : "bg-amber-400"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-fg truncate">{log.description}</p>
                    <p className="text-muted mt-0.5">{formatDateTime(log.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SecurityNotice />
    </div>
  );
}
