import { AlertTriangle, Loader2, Mail, Menu, Server, ServerOff } from "lucide-react";
import StatusPill from "./StatusPill.jsx";

function gmailPill(gmail) {
  if (!gmail || gmail.state === "loading") {
    return { icon: Loader2, value: "Checking…", tone: "pending" };
  }
  if (gmail.state === "error") {
    return { icon: AlertTriangle, value: "Unavailable", tone: "bad" };
  }
  if (gmail.status?.needs_reconnect) {
    return { icon: AlertTriangle, value: "Reconnect needed", tone: "pending" };
  }
  if (gmail.status?.connected) {
    return { icon: Mail, value: "Connected", tone: "good" };
  }
  return { icon: Mail, value: "Not connected", tone: "neutral" };
}

export default function Header({ health, gmail, onOpenMenu }) {
  const backend =
    health.state === "online"
      ? { icon: Server, value: "Connected", tone: "good" }
      : health.state === "offline"
        ? { icon: ServerOff, value: "Unreachable", tone: "bad" }
        : { icon: Loader2, value: "Checking…", tone: "pending" };
  const mail = gmailPill(gmail);

  return (
    <header className="border-b border-line bg-ink-950/80 px-4 py-5 backdrop-blur sm:px-8">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="mt-0.5 rounded-lg border border-line p-2 text-muted hover:text-fg lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Email Command Center</h1>
          <p className="mt-1 max-w-prose text-sm text-muted sm:text-base">
            Track recruiter email, opportunities and reply drafts in one place, with you approving
            every future send.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusPill
          icon={backend.icon}
          label="Backend"
          value={backend.value}
          tone={backend.tone}
        >
          {health.state === "offline" && (
            <button
              type="button"
              onClick={health.retry}
              className="ml-1 rounded-md px-1.5 text-xs font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          )}
        </StatusPill>
        <StatusPill icon={mail.icon} label="Gmail" value={mail.value} tone={mail.tone} />
      </div>
    </header>
  );
}
