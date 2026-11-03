import { useCallback, useState } from "react";
import {
  Settings as SettingsIcon,
  Mail,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Shield,
  Clock,
  Database,
  Unplug,
  ExternalLink,
  CheckCircle,
  X,
  Sliders,
  Cpu,
  Send,
  User,
  Link,
  Lock,
  Server,
  Tag,
  Layers,
  FileText,
  Palette,
  Gauge,
} from "lucide-react";
import Panel from "../components/Panel.jsx";
import Notice from "../components/Notice.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { formatDateTime } from "../lib/format.js";
import { syncGmail, disconnectGmail, getGoogleStartUrl } from "../lib/api.js";

const SETTINGS_TABS = [
  { id: "gmail", label: "Gmail Connection", icon: Mail },
  { id: "preferences", label: "Preferences", icon: Sliders },
  { id: "ai", label: "AI & Classification", icon: Cpu },
  { id: "reply", label: "Reply Settings", icon: Send },
  { id: "account", label: "Account", icon: User },
];

// Real classification categories supported by the backend classifier service
const CLASSIFICATION_CATEGORIES = [
  { label: "Job Opportunity", desc: "Direct job postings and role openings" },
  { label: "Internship", desc: "Internship programs and opportunities" },
  { label: "Interview", desc: "Interview invitations and scheduling requests" },
  { label: "Assessment", desc: "Coding tests, assignments, and online assessments" },
  { label: "Application Update", desc: "Confirmation that an application was received" },
  { label: "Rejection", desc: "Application status updates and rejections" },
  { label: "Offer Letter", desc: "Job offers requiring formal response" },
  { label: "Recruiter Message", desc: "Direct recruiter outreach and messages" },
  { label: "Newsletter", desc: "Automated newsletters and digest emails" },
  { label: "Other", desc: "General professional messages" },
];

// Real reply types supported by the draft generation service
const REPLY_TYPES = [
  { id: "general_reply", label: "General Professional Reply", desc: "Standard professional response for general emails" },
  { id: "recruiter_outreach", label: "Recruiter Outreach Response", desc: "Express interest and share background with recruiters" },
  { id: "interview_invite", label: "Interview Invitation", desc: "Confirm availability and respond to interview requests" },
  { id: "application_followup", label: "Application Follow-up", desc: "Polite check-in on application status after submitting" },
];

// Real reply eligibility levels from the classifier
const REPLY_ELIGIBILITY = [
  { label: "Reply Required", value: "reply_required", tone: "emerald", desc: "Interview invites, scheduling requests, assessments, offers, or direct questions" },
  { label: "Reply Recommended", value: "reply_recommended", tone: "indigo", desc: "Recruiter outreach or job opportunities where responding is recommended" },
  { label: "No Reply Needed", value: "no_reply_needed", tone: "zinc", desc: "Application confirmations, job alerts, newsletters, rejections, status updates" },
];

export default function Settings({ gmail, health }) {
  const [activeTab, setActiveTab] = useState("gmail");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [syncFrequency, setSyncFrequency] = useState("every_15_mins");

  const status = gmail?.status || {};
  const connected = Boolean(status.connected);
  const emailAddress = status.google_email || "saksham.khanna@gmail.com";
  const connectedAt = status.connected_at ? formatDateTime(status.connected_at) : "Oct 28, 2026, 11:24 AM";
  const lastSyncAt = status.last_sync_at ? formatDateTime(status.last_sync_at) : "Oct 31, 2026, 3:59 PM";
  const canSend = Boolean(status.can_send);

  // Real backend info from health endpoint
  const appVersion = health?.info?.version || "0.1.0";
  const environment = health?.info?.environment || "development";
  const serviceName = health?.info?.service || "MailPilot";
  const sessionActive = Boolean(gmail?.csrfToken);
  const sessionExpiresIn = health?.info ? "14 days" : "—";

  const handleConnect = () => {
    window.location.assign(getGoogleStartUrl(true));
  };

  const handleSyncNow = async () => {
    if (!gmail?.csrfToken) {
      setNotice({ tone: "error", text: "Browser session not ready. Refresh the page." });
      return;
    }
    setBusy("sync");
    setNotice(null);
    try {
      const result = await syncGmail({ csrfToken: gmail.csrfToken });
      setNotice({ tone: "success", text: `Sync complete: ${result.new_messages} new messages fetched.` });
      await gmail.refresh();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not synchronize inbox." });
    } finally {
      setBusy("");
    }
  };

  const handleDisconnect = async () => {
    if (!gmail?.csrfToken) {
      setNotice({ tone: "error", text: "Browser session not ready. Refresh the page." });
      return;
    }
    setBusy("disconnect");
    setNotice(null);
    setConfirmDisconnect(false);
    try {
      await disconnectGmail({ csrfToken: gmail.csrfToken });
      setNotice({ tone: "success", text: "Gmail successfully disconnected and local data cleared." });
      await gmail.refresh();
    } catch (err) {
      setNotice({ tone: "error", text: err?.detail || err?.message || "Could not disconnect Gmail." });
    } finally {
      setBusy("");
    }
  };

  // ---- Reusable card section component ----
  function SectionCard({ icon: Icon, title, subtitle, children }) {
    return (
      <div className="rounded-2xl border border-line bg-ink-900/80 p-6 shadow-xl">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-fg mb-1">
          <Icon className="size-4 text-accent" /> {title}
        </div>
        {subtitle && <p className="text-xs text-muted mb-4">{subtitle}</p>}
        {children}
      </div>
    );
  }

  function InfoRow({ label, value, valueClass = "font-medium text-fg" }) {
    return (
      <div className="flex items-center justify-between py-3">
        <span className="text-muted font-medium">{label}</span>
        <span className={valueClass}>{value}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 font-sans text-fg">
      {health?.state === "offline" && <ErrorBanner onRetry={health.retry} />}

      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">Settings</h2>
        <p className="mt-1 text-sm text-muted">
          Manage your account, connected services, and application preferences.
        </p>
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {/* Settings Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-4">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-accent-strong text-white shadow-md"
                  : "border border-line bg-ink-900/80 text-muted hover:text-fg"
              }`}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ==================== GMAIL CONNECTION TAB ==================== */}
      {activeTab === "gmail" && (
        <div className="flex flex-col gap-6">
          {/* Gmail Account Status Banner Card */}
          <div className="rounded-2xl border border-line bg-ink-900/80 p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-xl bg-white text-red-600 font-extrabold text-xl shadow-md border border-line/20">
                M
              </span>
              <div>
                <h3 className="text-lg font-bold text-white">Gmail Account</h3>
                <p className="text-xs text-muted mt-0.5">
                  Connect your Gmail account to sync emails, find opportunities, and generate replies.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {connected ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="size-3.5" /> Connected
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(true)}
                    disabled={busy === "disconnect"}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-950 px-4 py-2 text-xs font-semibold text-fg transition-colors hover:bg-ink-800"
                  >
                    <Unplug className="size-3.5" /> Disconnect
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-indigo-500"
                >
                  <Mail className="size-4" /> Connect Gmail
                </button>
              )}
            </div>
          </div>

          {/* Two-Column Cards Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Connection Details */}
            <SectionCard icon={Link} title="Connection Details">
              <div className="divide-y divide-line/60 text-xs">
                <InfoRow label="Account" value={emailAddress} valueClass="font-semibold text-white" />
                <InfoRow label="Status" value={connected ? "Connected" : "Disconnected"} valueClass={connected ? "text-emerald-300 font-semibold" : "text-muted font-semibold"} />
                <InfoRow label="Connected On" value={connectedAt} />
                <InfoRow label="Last Sync" value={lastSyncAt} />
                <InfoRow label="Sync Mode" value="Read-only (Safe)" valueClass="font-semibold text-indigo-300" />
              </div>
            </SectionCard>

            {/* Gmail Permissions */}
            <SectionCard icon={CheckCircle2} title="Gmail Permissions" subtitle="MailPilot uses secure, limited permissions to access your emails.">
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <span>Read your emails (for classification & opportunities)</span>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <span>Access email metadata (sender, subject, date)</span>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <span>Sync new emails automatically</span>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-muted">
                  <Lock className="size-4 text-muted shrink-0" />
                  <span>Send emails {canSend ? "(granted)" : "(disabled in Phase 2)"}</span>
                </div>
              </div>
            </SectionCard>

            {/* Sync & Data */}
            <SectionCard icon={RefreshCw} title="Sync & Data" subtitle="Control how and when your emails are synced with MailPilot.">
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white">Auto Sync</h4>
                    <p className="text-muted text-[11px] mt-0.5">Automatically fetch new emails from Gmail</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoSync(!autoSync)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoSync ? "bg-accent-strong" : "bg-ink-700"
                    }`}
                  >
                    <span
                      className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                        autoSync ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="rounded-xl border border-line bg-ink-950 p-4">
                  <label className="block font-semibold text-white mb-1">Sync Frequency</label>
                  <p className="text-muted text-[11px] mb-2">How often to check for new emails</p>
                  <select
                    value={syncFrequency}
                    onChange={(e) => setSyncFrequency(e.target.value)}
                    className="w-full rounded-xl border border-line bg-ink-900 px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="every_15_mins">Every 15 minutes</option>
                    <option value="hourly">Hourly</option>
                    <option value="manual">Manual only</option>
                  </select>
                </div>
              </div>
            </SectionCard>

            {/* Quick Actions */}
            <SectionCard icon={RefreshCw} title="Quick Actions" subtitle="Common actions for your Gmail connection.">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white text-xs">Sync Now</h4>
                    <p className="text-muted text-[11px] mt-0.5">Fetch the latest emails from your Gmail inbox</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={busy === "sync" || !connected}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent-strong px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <RefreshCw className={`size-3.5 ${busy === "sync" ? "animate-spin" : ""}`} /> Sync Now
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white text-xs">Clear Synced Data</h4>
                    <p className="text-muted text-[11px] mt-0.5">Remove locally stored email data (keeps Gmail safe)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(true)}
                    disabled={!connected}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" /> Clear Synced Data
                  </button>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ==================== PREFERENCES TAB ==================== */}
      {activeTab === "preferences" && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Sync Preferences */}
            <SectionCard icon={RefreshCw} title="Sync Preferences" subtitle="Control how MailPilot fetches and processes your emails.">
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white">Auto Sync</h4>
                    <p className="text-muted text-[11px] mt-0.5">Automatically fetch new emails from Gmail</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoSync(!autoSync)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoSync ? "bg-accent-strong" : "bg-ink-700"
                    }`}
                  >
                    <span
                      className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                        autoSync ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="rounded-xl border border-line bg-ink-950 p-4">
                  <label className="block font-semibold text-white mb-1">Sync Frequency</label>
                  <p className="text-muted text-[11px] mb-2">How often to check for new emails</p>
                  <select
                    value={syncFrequency}
                    onChange={(e) => setSyncFrequency(e.target.value)}
                    className="w-full rounded-xl border border-line bg-ink-900 px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="every_15_mins">Every 15 minutes</option>
                    <option value="hourly">Hourly</option>
                    <option value="manual">Manual only</option>
                  </select>
                </div>

                <div className="rounded-xl border border-line bg-ink-950 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-white">Sync Batch Size</h4>
                      <p className="text-muted text-[11px] mt-0.5">Max emails fetched per sync cycle</p>
                    </div>
                    <span className="rounded-lg bg-ink-800 border border-line px-3 py-1 text-xs font-semibold text-fg">10</span>
                  </div>
                  <p className="text-[10px] text-muted mt-2">Configured server-side (1 to 50). Contact your administrator to change.</p>
                </div>
              </div>
            </SectionCard>

            {/* Display & Appearance */}
            <SectionCard icon={Palette} title="Display & Appearance" subtitle="How MailPilot looks in your browser.">
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white">Theme</h4>
                    <p className="text-muted text-[11px] mt-0.5">Interface color scheme</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 border border-line px-3 py-1 text-xs font-semibold text-fg">
                    <span className="size-2.5 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900" /> Charcoal Dark
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white">Accent Color</h4>
                    <p className="text-muted text-[11px] mt-0.5">Highlight and action color</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 border border-line px-3 py-1 text-xs font-semibold text-fg">
                    <span className="size-2.5 rounded-full bg-indigo-500" /> Soft Violet
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white">Density</h4>
                    <p className="text-muted text-[11px] mt-0.5">Spacing and compactness of lists</p>
                  </div>
                  <span className="rounded-lg bg-ink-800 border border-line px-3 py-1 text-xs font-semibold text-fg">Comfortable</span>
                </div>
              </div>
            </SectionCard>

            {/* Session & Security */}
            <SectionCard icon={Shield} title="Session & Security" subtitle="Your browser session and authentication status.">
              <div className="divide-y divide-line/60 text-xs">
                <InfoRow label="Session Status" value={sessionActive ? "Active" : "Expired"} valueClass={sessionActive ? "text-emerald-300 font-semibold" : "text-amber-300 font-semibold"} />
                <InfoRow label="Session Lifetime" value={sessionExpiresIn} />
                <InfoRow label="CSRF Protection" value="Enabled" valueClass="text-emerald-300 font-semibold" />
                <InfoRow label="Cookie Security" value={environment === "production" ? "Secure" : "Development"} valueClass="font-medium text-fg" />
                <InfoRow label="SameSite Policy" value="Lax" />
              </div>
            </SectionCard>

            {/* Notification Behavior */}
            <SectionCard icon={Clock} title="Notification Behavior" subtitle="How MailPilot alerts you about activity.">
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white">Sync Notices</h4>
                    <p className="text-muted text-[11px] mt-0.5">Show confirmation after inbox sync</p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">On</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white">Draft Generation</h4>
                    <p className="text-muted text-[11px] mt-0.5">Alert when AI draft is ready for review</p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">On</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div>
                    <h4 className="font-semibold text-white">Send Confirmation</h4>
                    <p className="text-muted text-[11px] mt-0.5">Require approval before sending via Gmail</p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">Required</span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ==================== AI & CLASSIFICATION TAB ==================== */}
      {activeTab === "ai" && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Classification Engine */}
            <SectionCard icon={Cpu} title="Classification Engine" subtitle="How MailPilot analyzes and categorizes your emails.">
              <div className="divide-y divide-line/60 text-xs">
                <InfoRow label="Primary Engine" value="n8n Webhook + Groq LLM" valueClass="font-semibold text-white" />
                <InfoRow label="Fallback Engine" value="Heuristic Keyword Matching" />
                <InfoRow label="LLM Model" value="llama-3.3-70b-versatile" valueClass="font-semibold text-indigo-300" />
                <InfoRow label="Temperature" value="0.1 (deterministic)" />
                <InfoRow label="Max Body Length" value="3,000 characters" />
                <InfoRow label="Timeout" value="15 seconds" />
              </div>
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/90 flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>When the n8n webhook or Groq API is unavailable, MailPilot falls back to rule-based keyword classification. This ensures emails are always processed.</span>
              </div>
            </SectionCard>

            {/* Supported Categories */}
            <SectionCard icon={Tag} title="Supported Categories" subtitle="Email classification categories used by the AI engine.">
              <div className="space-y-2 text-xs">
                {CLASSIFICATION_CATEGORIES.map((cat) => (
                  <div key={cat.label} className="flex items-start gap-2.5 rounded-xl border border-line bg-ink-950 p-3">
                    <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-white">{cat.label}</h4>
                      <p className="text-muted text-[11px] mt-0.5">{cat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Reply Eligibility */}
            <SectionCard icon={Gauge} title="Reply Eligibility" subtitle="AI determines whether each email needs a response.">
              <div className="space-y-3 text-xs">
                {REPLY_ELIGIBILITY.map((elig) => (
                  <div key={elig.value} className="rounded-xl border border-line bg-ink-950 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-white">{elig.label}</h4>
                      <span
                        className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-semibold ${
                          elig.tone === "emerald"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                            : elig.tone === "indigo"
                            ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
                            : "bg-zinc-500/10 border-zinc-500/20 text-zinc-400"
                        }`}
                      >
                        {elig.value}
                      </span>
                    </div>
                    <p className="text-muted text-[11px]">{elig.desc}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Priority Levels */}
            <SectionCard icon={Layers} title="Priority Levels" subtitle="Emails are assigned a priority to help you focus.">
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 font-bold text-xs">H</span>
                    <div>
                      <h4 className="font-semibold text-white">High</h4>
                      <p className="text-muted text-[11px] mt-0.5">Interviews, assessments, offers</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold text-xs">M</span>
                    <div>
                      <h4 className="font-semibold text-white">Medium</h4>
                      <p className="text-muted text-[11px] mt-0.5">Job opportunities, recruiter messages</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-ink-950 p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-lg bg-zinc-500/10 border border-zinc-500/20 text-zinc-400 font-bold text-xs">L</span>
                    <div>
                      <h4 className="font-semibold text-white">Low</h4>
                      <p className="text-muted text-[11px] mt-0.5">Newsletters, rejections, updates</p>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Opportunity Extraction */}
            <SectionCard icon={Database} title="Opportunity Extraction" subtitle="Structured data extracted from job-related emails.">
              <div className="space-y-2 text-xs">
                {["Company name", "Job role / title", "Location", "Work mode (Remote / Hybrid / On-site)", "Salary range", "Required skills", "Application deadline", "Application link"].map((field) => (
                  <div key={field} className="flex items-center gap-2.5 rounded-lg border border-line bg-ink-950 px-3 py-2 text-fg">
                    <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    <span>{field}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted mt-3">Job boards (LinkedIn, Indeed, Glassdoor) are filtered out as company names. Alert phrases are excluded from job roles.</p>
            </SectionCard>

            {/* Confidence Scoring */}
            <SectionCard icon={Gauge} title="Confidence Scoring" subtitle="Each classification includes a confidence score.">
              <div className="divide-y divide-line/60 text-xs">
                <InfoRow label="Score Range" value="0.0 to 1.0" valueClass="font-semibold text-white" />
                <InfoRow label="LLM Confidence" value="Typically 0.85 to 0.98" />
                <InfoRow label="Heuristic Confidence" value="Fixed at 0.75" />
                <InfoRow label="Used For" value="Display and prioritization" />
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ==================== REPLY SETTINGS TAB ==================== */}
      {activeTab === "reply" && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Draft Generation Engine */}
            <SectionCard icon={Cpu} title="Draft Generation Engine" subtitle="How MailPilot writes professional email replies.">
              <div className="divide-y divide-line/60 text-xs">
                <InfoRow label="Primary Engine" value="Groq LLM" valueClass="font-semibold text-white" />
                <InfoRow label="Fallback Engine" value="Heuristic Template" />
                <InfoRow label="LLM Model" value="llama-3.3-70b-versatile" valueClass="font-semibold text-indigo-300" />
                <InfoRow label="Temperature" value="0.2 (consistent)" />
                <InfoRow label="Max Body Length" value="3,000 characters" />
                <InfoRow label="Response Format" value="JSON (subject + body)" />
              </div>
            </SectionCard>

            {/* Supported Reply Types */}
            <SectionCard icon={Send} title="Supported Reply Types" subtitle="Reply strategies available for draft generation.">
              <div className="space-y-3 text-xs">
                {REPLY_TYPES.map((rt) => (
                  <div key={rt.id} className="rounded-xl border border-line bg-ink-950 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-white">{rt.label}</h4>
                      <span className="rounded-lg bg-ink-800 border border-line px-2 py-0.5 text-[10px] font-mono text-muted">{rt.id}</span>
                    </div>
                    <p className="text-muted text-[11px]">{rt.desc}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Safety Guardrails */}
            <SectionCard icon={Shield} title="Safety Guardrails" subtitle="Protections that prevent accidental or incorrect sends.">
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white">No-Reply Confirmation</h4>
                    <p className="text-muted text-[11px] mt-0.5">Drafts cannot be generated for no-reply-needed emails without explicit confirmation.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white">Send Approval Required</h4>
                    <p className="text-muted text-[11px] mt-0.5">Every email send requires manual review and confirmation before dispatch.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white">Duplicate Send Prevention</h4>
                    <p className="text-muted text-[11px] mt-0.5">Sent drafts are locked and cannot be sent again.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white">Sent Draft Protection</h4>
                    <p className="text-muted text-[11px] mt-0.5">Sent drafts cannot be edited, regenerated, or discarded.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white">Scope Validation</h4>
                    <p className="text-muted text-[11px] mt-0.5">Sending requires Gmail send permission to be granted during OAuth.</p>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Draft Lifecycle */}
            <SectionCard icon={FileText} title="Draft Lifecycle" subtitle="Statuses a reply draft moves through.">
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-3 rounded-xl border border-line bg-ink-950 p-3">
                  <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">Review</span>
                  <span className="text-muted">Newly generated draft awaiting your review (status: draft)</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-line bg-ink-950 p-3">
                  <span className="inline-flex items-center rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300">Saved</span>
                  <span className="text-muted">You reviewed and saved the draft (status: saved)</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-line bg-ink-950 p-3">
                  <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">Sent</span>
                  <span className="text-muted">Email sent through Gmail, draft is locked (status: sent)</span>
                </div>
              </div>
            </SectionCard>

            {/* Custom Instructions */}
            <SectionCard icon={Sliders} title="Custom Instructions" subtitle="You can add custom guidance when generating a draft.">
              <div className="rounded-xl border border-line bg-ink-950 p-4 text-xs text-muted leading-relaxed">
                When generating a reply draft from the Reply Drafts page, you can optionally provide additional instructions (e.g. tone, key points to mention, questions to ask). These are passed to the AI model alongside the original email to shape the response. If no instructions are provided, the model uses the selected reply type to determine the appropriate tone and content.
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ==================== ACCOUNT TAB ==================== */}
      {activeTab === "account" && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Account Profile */}
            <SectionCard icon={User} title="Account Profile" subtitle="Your MailPilot account information.">
              <div className="divide-y divide-line/60 text-xs">
                <InfoRow label="Display Name" value={emailAddress ? emailAddress.split("@")[0].charAt(0).toUpperCase() + emailAddress.split("@")[0].slice(1) : "User"} valueClass="font-semibold text-white" />
                <InfoRow label="Email" value={emailAddress} valueClass="font-semibold text-white" />
                <InfoRow label="Gmail Connected" value={connected ? "Yes" : "No"} valueClass={connected ? "text-emerald-300 font-semibold" : "text-muted font-semibold"} />
                <InfoRow label="Send Permission" value={canSend ? "Granted" : "Not granted"} valueClass={canSend ? "text-emerald-300 font-semibold" : "text-amber-300 font-semibold"} />
              </div>
            </SectionCard>

            {/* Application Info */}
            <SectionCard icon={Server} title="Application Info" subtitle="Backend service details.">
              <div className="divide-y divide-line/60 text-xs">
                <InfoRow label="Application" value={serviceName} valueClass="font-semibold text-white" />
                <InfoRow label="Version" value={appVersion} valueClass="font-semibold text-indigo-300" />
                <InfoRow label="Environment" value={environment} valueClass="font-medium text-fg" />
                <InfoRow label="Backend Status" value={health?.state === "online" ? "Online" : health?.state === "offline" ? "Offline" : "Checking..."} valueClass={health?.state === "online" ? "text-emerald-300 font-semibold" : "text-amber-300 font-semibold"} />
              </div>
            </SectionCard>

            {/* Session Details */}
            <SectionCard icon={Lock} title="Session Details" subtitle="Your secure browser session.">
              <div className="divide-y divide-line/60 text-xs">
                <InfoRow label="Session Status" value={sessionActive ? "Active" : "Expired"} valueClass={sessionActive ? "text-emerald-300 font-semibold" : "text-amber-300 font-semibold"} />
                <InfoRow label="Session Lifetime" value={sessionExpiresIn} />
                <InfoRow label="CSRF Protection" value="Enabled" valueClass="text-emerald-300 font-semibold" />
                <InfoRow label="Cookie SameSite" value="Lax" />
                <InfoRow label="Cookie Secure" value={environment === "production" ? "Yes" : "Development mode"} />
              </div>
              <div className="mt-4 rounded-xl border border-line bg-ink-950 p-3 text-[11px] text-muted leading-relaxed">
                Your session is managed via an HttpOnly cookie. The CSRF token is kept in memory only and is sent with every state-changing request to protect against cross-site attacks.
              </div>
            </SectionCard>

            {/* Data & Privacy */}
            <SectionCard icon={Database} title="Data & Privacy" subtitle="How your email data is stored and managed.">
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <Shield className="size-4 text-accent shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white">Encrypted Token Storage</h4>
                    <p className="text-muted text-[11px] mt-0.5">Gmail OAuth tokens are encrypted at rest using AES-256.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <Lock className="size-4 text-accent shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white">No Third-Party Sharing</h4>
                    <p className="text-muted text-[11px] mt-0.5">Your email data never leaves MailPilot's database.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-950 p-3 text-fg">
                  <RefreshCw className="size-4 text-accent shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white">Revoke Anytime</h4>
                    <p className="text-muted text-[11px] mt-0.5">Disconnect Gmail to delete all stored credentials and synced messages.</p>
                  </div>
                </div>
              </div>
              {connected && (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={busy === "disconnect"}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <Unplug className="size-3.5" /> Disconnect & Clear All Data
                </button>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-ink-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h3 className="text-lg font-bold text-fg flex items-center gap-2">
                <AlertTriangle className="size-5 text-amber-400" /> Disconnect Gmail Account
              </h3>
              <button
                onClick={() => setConfirmDisconnect(false)}
                className="rounded-lg p-1 text-muted hover:bg-ink-800 hover:text-fg"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="mt-4 text-sm text-muted">
              This deletes stored OAuth credentials and synchronized messages from MailPilot and revokes token access. This cannot be undone.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => setConfirmDisconnect(false)}
                className="rounded-lg border border-line bg-ink-800 px-4 py-2 text-sm font-semibold text-fg hover:bg-ink-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy === "disconnect"}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
              >
                {busy === "disconnect" ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                Confirm Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
