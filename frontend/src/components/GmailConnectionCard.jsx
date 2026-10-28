import { AlertTriangle, Loader2, Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import Panel from "./Panel.jsx";
import Notice from "./Notice.jsx";
import { formatDateTime, pluralize } from "../lib/format.js";

const ERROR_LABELS = {
  reauth_required: "Gmail authorization expired",
  gmail_rate_limited: "Gmail rate limit reached",
  gmail_unavailable: "Gmail is temporarily unavailable",
  gmail_api_error: "Gmail returned an error",
  gmail_forbidden: "Gmail permission was denied",
  gmail_credentials_invalid: "Stored Gmail credentials are unavailable",
  internal_error: "Synchronization failed",
};

function errorLabel(code) {
  return ERROR_LABELS[code] || "The last synchronization failed";
}

function Button({ variant = "secondary", ...props }) {
  const styles = {
    primary:
      "bg-accent-strong text-white hover:bg-indigo-500 disabled:bg-ink-700 disabled:text-muted",
    secondary:
      "border border-line bg-ink-800 text-fg hover:border-accent/50 disabled:text-muted",
    danger:
      "border border-rose-400/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20 disabled:text-muted",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]}`}
      {...props}
    />
  );
}

export default function GmailConnectionCard({
  gmail,
  busy,
  confirming,
  onConnect,
  onSync,
  onDisconnect,
  onCancelDisconnect,
  onConfirmDisconnect,
  onRetry,
}) {
  const status = gmail.status;
  const connected = Boolean(status?.connected);

  return (
    <Panel title="Gmail connection" icon={Mail}>
      <div className="p-5">
        {gmail.state === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Checking Gmail connection…
          </p>
        )}

        {gmail.state === "error" && (
          <Notice
            tone="error"
            onDismiss={null}
          >
            <p className="font-semibold">Connection status unavailable</p>
            <p className="mt-1 text-rose-100/90">{gmail.error}</p>
            <Button onClick={onRetry} className="mt-3">
              <RefreshCw aria-hidden="true" className="size-4" />
              Retry
            </Button>
          </Notice>
        )}

        {gmail.state === "ready" && !connected && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-semibold">Gmail is not connected</p>
              <p className="mt-1 max-w-prose text-sm text-muted">
                Connect Gmail to read a limited number of recent inbox messages. MailPilot requests
                read-only access and never sends email.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={onConnect} disabled={Boolean(busy)}>
                <Mail aria-hidden="true" className="size-4" />
                Connect Gmail
              </Button>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <ShieldCheck aria-hidden="true" className="size-4" />
                Read-only Gmail scope
              </span>
            </div>
          </div>
        )}

        {gmail.state === "ready" && connected && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
                  Connected
                </p>
                <p className="mt-1 break-all text-sm text-muted">{status.google_email}</p>
              </div>
              {gmail.refreshing && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  Refreshing…
                </span>
              )}
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Last sync</dt>
                <dd className="mt-0.5 font-medium">
                  {status.last_sync_at ? formatDateTime(status.last_sync_at) : "Never"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Stored messages</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{status.message_count}</dd>
              </div>
              <div>
                <dt className="text-muted">Access</dt>
                <dd className="mt-0.5 font-medium">Read-only inbox</dd>
              </div>
            </dl>

            {status.needs_reconnect && (
              <div
                role="alert"
                className="flex gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100"
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <p>Google authorization has expired. Reconnect Gmail to continue synchronizing.</p>
              </div>
            )}

            {!status.needs_reconnect && status.last_error && (
              <div
                role="alert"
                className="flex gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100"
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <p>Last sync failed: {errorLabel(status.last_error)}.</p>
              </div>
            )}

            {status.message_count > 0 && (
              <p className="text-xs text-muted">
                Showing up to 50 of {pluralize(status.message_count, "stored message")}.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {status.needs_reconnect && (
                <Button variant="primary" onClick={onConnect} disabled={Boolean(busy)}>
                  <Mail aria-hidden="true" className="size-4" />
                  Reconnect Gmail
                </Button>
              )}
              <Button
                variant="primary"
                onClick={onSync}
                disabled={Boolean(busy) || status.needs_reconnect || !gmail.csrfToken}
              >
                {busy === "sync" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <RefreshCw aria-hidden="true" className="size-4" />
                )}
                {busy === "sync" ? "Synchronizing…" : "Synchronize inbox"}
              </Button>
              <Button
                variant="secondary"
                onClick={onDisconnect}
                disabled={Boolean(busy)}
              >
                <Unplug aria-hidden="true" className="size-4" />
                Disconnect
              </Button>
            </div>

            {confirming && (
              <div
                role="alertdialog"
                aria-labelledby="disconnect-title"
                aria-describedby="disconnect-description"
                className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-4"
              >
                <h3 id="disconnect-title" className="text-sm font-semibold text-rose-100">
                  Disconnect Gmail and delete local data?
                </h3>
                <p id="disconnect-description" className="mt-1 text-sm text-rose-100/90">
                  This deletes the stored OAuth credentials and synchronized messages from
                  MailPilot. MailPilot will also ask Google to revoke the token when possible. This
                  cannot be undone.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="danger" onClick={onConfirmDisconnect} disabled={Boolean(busy)}>
                    {busy === "disconnect" ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <Unplug aria-hidden="true" className="size-4" />
                    )}
                    {busy === "disconnect" ? "Disconnecting…" : "Confirm disconnect"}
                  </Button>
                  <Button onClick={onCancelDisconnect} disabled={Boolean(busy)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
