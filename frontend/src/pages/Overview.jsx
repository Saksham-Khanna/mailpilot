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
  Sparkles,
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
      <div className="relative overflow-hidden rounded-2xl border border-[#303034] bg-gradient-to-r from-[#19191C] via-[#141416] to-[#0B0B0D] p-6 sm:p-8 shadow-xl">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#D4AF37]/10 via-[#303034]/20 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]">
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
                  className="inline-flex items-center gap-2 rounded-xl border border-[#303034] bg-[#1F1F22] px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-[#D4AF37]/50"
                >
                  <Mail className="size-4 text-[#D4AF37]" /> View Inbox
                </a>
                <a
                  href="#/opportunities"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#0B0B0D] shadow-lg transition-colors hover:bg-[#F5D77A]"
                >
                  <Target className="size-4" /> + New Opportunity
                </a>
              </>
            ) : (
              <button
                type="button"
                onClick={() => window.location.assign(getGoogleStartUrl())}
                className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#0B0B0D] shadow-lg transition-colors hover:bg-[#F5D77A]"
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
        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
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
        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
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
        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
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
        <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-5 shadow-sm transition-all hover:border-[#D4AF37]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
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
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-[#303034]">
              <div className="flex items-center gap-2.5">
                <Target className="size-5 text-[#D4AF37]" />
                <h3 className="text-base font-bold text-white">Recent Opportunities</h3>
              </div>
              <a href="#/opportunities" className="text-xs font-semibold text-[#D4AF37] hover:underline flex items-center gap-1">
                View All →
              </a>
            </div>

            <div className="mt-4 divide-y divide-[#303034]">
              {loadingData && (
                <div className="flex items-center gap-2 py-6 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin text-[#D4AF37]" /> Loading opportunities...
                </div>
              )}
              {!loadingData && !connected && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted">Gmail is not connected. Connect Gmail to view opportunities.</p>
                  <button
                    type="button"
                    onClick={() => window.location.assign(getGoogleStartUrl())}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0B0B0D] shadow-lg transition-colors hover:bg-[#F5D77A]"
                  >
                    <Mail className="size-3.5" /> Connect Gmail
                  </button>
                </div>
              )}
              {!loadingData && connected && opportunities.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted">No opportunities extracted yet.</p>
                  <a href="#/opportunities" className="mt-2 inline-block text-xs font-semibold text-[#D4AF37] hover:underline">
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
                  <div key={opp.message_id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 transition-colors hover:bg-[#1F1F22] px-2 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#1F1F22] text-[#D4AF37] border border-[#303034] font-bold text-xs shadow-inner">
                        {company.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate">{company} – {role}</h4>
                        <p className="text-xs text-muted truncate mt-0.5">{opp.summary || details.location || "Potential fit for your profile."}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        priority === "High" ? "bg-rose-500/10 text-rose-300 border-rose-500/30" : "bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30"
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
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-[#303034]">
              <div className="flex items-center gap-2.5">
                <Activity className="size-5 text-[#D4AF37]" />
                <h3 className="text-base font-bold text-white">AI Suggestions</h3>
              </div>
              <a href="#/drafts" className="text-xs font-semibold text-[#D4AF37] hover:underline">
                View All →
              </a>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#303034] bg-[#141416] p-4 transition-all hover:border-[#D4AF37]/40">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
                    <FileEdit className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Reply to {pendingDraftsCount || 3} pending emails</h4>
                    <p className="text-xs text-muted mt-0.5">AI can draft personalized professional replies.</p>
                  </div>
                </div>
                <a
                  href="#/drafts"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3.5 py-1.5 text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5D77A]"
                >
                  Generate Replies →
                </a>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#303034] bg-[#141416] p-4 transition-all hover:border-[#D4AF37]/40">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
                    <Target className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{opportunities.length || 2} new high-match opportunities</h4>
                    <p className="text-xs text-muted mt-0.5">Based on your profile and recent inbox sync.</p>
                  </div>
                </div>
                <a
                  href="#/opportunities"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#303034] bg-[#1F1F22] px-3.5 py-1.5 text-xs font-semibold text-fg hover:bg-[#2A2A2E]"
                >
                  View Opportunities →
                </a>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#303034] bg-[#141416] p-4 transition-all hover:border-[#D4AF37]/40">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1F1F22] text-[#D4AF37] border border-[#303034]">
                    <Activity className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Improve your outreach</h4>
                    <p className="text-xs text-muted mt-0.5">Get AI suggestions to increase interview response rate.</p>
                  </div>
                </div>
                <a
                  href="#/logs"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#303034] bg-[#1F1F22] px-3.5 py-1.5 text-xs font-semibold text-fg hover:bg-[#2A2A2E]"
                >
                  View Activity Logs →
                </a>
              </div>
            </div>
          </div>

          {/* AI Co-Pilot Summary & Action Ticker Panel */}
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-[#303034]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30">
                  <Sparkles className="size-5 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">AI Co-Pilot Live Insights</h3>
                  <p className="text-xs text-muted">Real-time intelligence from your synced inbox</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Active Co-Pilot
              </span>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[#303034] bg-[#141416] p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-muted font-medium">Synced Inbox</span>
                  <div className="text-2xl font-extrabold text-white mt-1">{messageCount}</div>
                </div>
                <p className="text-[11px] text-muted mt-3 pt-2 border-t border-[#303034]/60">
                  {messageCount > 0 ? "Emails synced & ready for AI evaluation." : "Connect Gmail to sync messages."}
                </p>
              </div>

              <div className="rounded-xl border border-[#303034] bg-[#141416] p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-muted font-medium">Classified Opportunities</span>
                  <div className="text-2xl font-extrabold text-[#D4AF37] mt-1">{opportunities.length}</div>
                </div>
                <p className="text-[11px] text-muted mt-3 pt-2 border-t border-[#303034]/60">
                  {opportunities.length > 0 ? "Tracked recruiter outreach & replies." : "Run AI classifier to extract."}
                </p>
              </div>

              <div className="rounded-xl border border-[#303034] bg-[#141416] p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-muted font-medium">Pending Reply Drafts</span>
                  <div className="text-2xl font-extrabold text-emerald-400 mt-1">{pendingDraftsCount}</div>
                </div>
                <p className="text-[11px] text-muted mt-3 pt-2 border-t border-[#303034]/60">
                  {pendingDraftsCount > 0 ? "AI drafts awaiting your review." : "All drafts reviewed or sent."}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Sparkles className="size-5 text-[#D4AF37] shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-fg">
                  <span className="font-semibold text-white">Co-Pilot Recommendation: </span>
                  {pendingDraftsCount > 0 
                    ? `You have ${pendingDraftsCount} pending AI reply draft(s) waiting for approval. Review and send them to boost response rate.`
                    : opportunities.length === 0 && messageCount > 0
                    ? `You have ${messageCount} synced email(s). Run the AI Classifier to extract interview invites and recruiter outreach.`
                    : `Your inbox is up to date! Continue monitoring your opportunities and drafts.`
                  }
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                {pendingDraftsCount > 0 ? (
                  <a
                    href="#/drafts"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-[#0B0B0D] hover:bg-[#F5D77A] transition-all"
                  >
                    Review Drafts →
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleQuickClassify}
                    disabled={busyAction === "classify" || !connected || messageCount === 0}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-[#0B0B0D] hover:bg-[#F5D77A] transition-all disabled:opacity-50"
                  >
                    {busyAction === "classify" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    Classify New Emails
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Quick Actions Panel */}
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-6 shadow-sm">
            <h3 className="text-base font-bold text-white pb-4 border-b border-[#303034] flex items-center gap-2">
              <CheckCircle2 className="size-5 text-[#D4AF37]" /> Quick Actions
            </h3>

            <div className="mt-4 grid gap-2.5">
              <button
                type="button"
                onClick={handleQuickSync}
                disabled={busyAction === "sync" || !connected}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[#303034] bg-[#141416] text-sm font-medium text-fg transition-all hover:border-[#D4AF37]/40 hover:bg-[#1F1F22] disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  {busyAction === "sync" ? <Loader2 className="size-4 animate-spin text-[#D4AF37]" /> : <RefreshCw className="size-4 text-[#D4AF37]" />}
                  Sync Gmail
                </span>
                <ChevronRight className="size-4 text-muted" />
              </button>

              <button
                type="button"
                onClick={handleQuickClassify}
                disabled={busyAction === "classify" || !connected}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[#303034] bg-[#141416] text-sm font-medium text-fg transition-all hover:border-[#D4AF37]/40 hover:bg-[#1F1F22] disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <Target className="size-4 text-[#D4AF37]" /> Extract Opportunities
                </span>
                <ChevronRight className="size-4 text-muted" />
              </button>

              <a
                href="#/drafts"
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[#303034] bg-[#141416] text-sm font-medium text-fg transition-all hover:border-[#D4AF37]/40 hover:bg-[#1F1F22]"
              >
                <span className="flex items-center gap-3">
                  <FileEdit className="size-4 text-[#D4AF37]" /> Generate Reply Drafts
                </span>
                <ChevronRight className="size-4 text-muted" />
              </a>

              <a
                href="#/logs"
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[#303034] bg-[#141416] text-sm font-medium text-fg transition-all hover:border-[#D4AF37]/40 hover:bg-[#1F1F22]"
              >
                <span className="flex items-center gap-3">
                  <ScrollText className="size-4 text-[#D4AF37]" /> View Activity Logs
                </span>
                <ChevronRight className="size-4 text-muted" />
              </a>
            </div>
          </div>

          {/* Recent Activity Panel */}
          <div className="rounded-2xl border border-[#303034] bg-[#19191C] p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-[#303034]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="size-5 text-[#D4AF37]" /> Recent Activity
              </h3>
              <a href="#/logs" className="text-xs font-semibold text-[#D4AF37] hover:underline">
                View All →
              </a>
            </div>

            <div className="mt-4 space-y-4">
              {loadingData && (
                <div className="flex items-center gap-2 py-4 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin text-[#D4AF37]" /> Loading activity...
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
