import { Activity, CheckCircle2, FileEdit, Inbox, Mail, Target } from "lucide-react";
import StatCard from "../components/StatCard.jsx";
import Panel from "../components/Panel.jsx";
import EmptyState from "../components/EmptyState.jsx";
import SecurityNotice from "../components/SecurityNotice.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { pluralize } from "../lib/format.js";

const BASE_STATS = [
  { label: "Emails Synchronized", icon: Mail },
  { label: "Opportunities Found", icon: Target, note: "Available after classification (Phase 3)" },
  { label: "Pending Drafts", icon: FileEdit, note: "Available after draft generation (Phase 4)" },
  { label: "Approved Sends", icon: CheckCircle2, note: "Available after approval flow (Phase 5)" },
];

const FUTURE_PANELS = [
  { title: "Priority Opportunities", icon: Target, empty: ["No opportunities yet", "Interview invites and internship offers will be surfaced here once classification is built."] },
  { title: "Pending Reply Drafts", icon: FileEdit, empty: ["No drafts waiting", "Drafts that need your approval will appear here."] },
  { title: "Agent Activity", icon: Activity, empty: ["No activity yet", "The agent hasn’t run. Its actions will be logged here."] },
];

function InboxSummary({ gmail }) {
  const status = gmail?.status;
  if (gmail?.state === "loading") {
    return <p className="px-5 py-6 text-sm text-muted">Checking Gmail connection…</p>;
  }
  if (gmail?.state === "error") {
    return (
      <EmptyState
        icon={Inbox}
        title="Inbox status unavailable"
        description="Open Inbox to retry the backend connection."
      />
    );
  }
  if (!status?.connected) {
    return (
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-ink-800 text-accent">
          <Inbox aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-3 text-sm font-semibold">Gmail is not connected</p>
        <p className="mt-1 max-w-xs text-sm text-muted">
          Connect Gmail in Inbox to synchronize recent messages.
        </p>
        <a
          href="#/inbox"
          className="mt-4 rounded-lg bg-accent-strong px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Open Inbox
        </a>
      </div>
    );
  }
  if (status.message_count === 0) {
    return (
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-ink-800 text-accent">
          <Inbox aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-3 text-sm font-semibold">No synchronized messages yet</p>
        <p className="mt-1 max-w-xs text-sm text-muted">
          Open Inbox and press “Synchronize inbox” to fetch recent messages.
        </p>
        <a
          href="#/inbox"
          className="mt-4 rounded-lg bg-accent-strong px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Open Inbox
        </a>
      </div>
    );
  }
  return (
    <div className="p-5">
      <p className="text-sm font-semibold">
        {pluralize(status.message_count, "message")} synchronized
      </p>
      <p className="mt-1 text-sm text-muted">From {status.google_email} (read-only).</p>
      <a
        href="#/inbox"
        className="mt-4 inline-block rounded-lg bg-accent-strong px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Open Inbox
      </a>
    </div>
  );
}

export default function Overview({ health, gmail }) {
  const connected = Boolean(gmail?.status?.connected);
  const stats = BASE_STATS.map((stat, index) => {
    if (index !== 0) return stat;
    return {
      ...stat,
      value: connected ? gmail.status.message_count : null,
      note: connected
        ? "Stored from your Gmail inbox (read-only)"
        : gmail?.state === "error"
          ? "Connection status unavailable; open Inbox to retry"
          : "Connect Gmail in Inbox to synchronize",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      {health.state === "offline" && <ErrorBanner onRetry={health.retry} />}

      <section aria-label="Statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, i) => (
          <StatCard key={stat.label} index={i} {...stat} />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent Emails" icon={Inbox}>
          <InboxSummary gmail={gmail} />
        </Panel>
        {FUTURE_PANELS.map(({ title, icon, empty }) => (
          <Panel key={title} title={title} icon={icon}>
            <EmptyState icon={icon} title={empty[0]} description={empty[1]} />
          </Panel>
        ))}
      </div>

      <SecurityNotice />
    </div>
  );
}
