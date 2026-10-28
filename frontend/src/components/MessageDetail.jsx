import { Loader2, Mail, RefreshCw } from "lucide-react";
import Panel from "./Panel.jsx";
import EmptyState from "./EmptyState.jsx";
import { formatDateTime } from "../lib/format.js";

export default function MessageDetail({ message, loading, error, onRetry }) {
  return (
    <Panel title="Message detail" icon={Mail}>
      {loading && (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Loading message…
        </p>
      )}

      {!loading && error && (
        <div className="px-5 py-6">
          <p role="alert" className="text-sm text-rose-100">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent/50"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Retry
          </button>
        </div>
      )}

      {!loading && !error && !message && (
        <EmptyState
          icon={Mail}
          title="Select a message"
          description="Choose a synchronized message to read its subject and plain-text content."
        />
      )}

      {!loading && !error && message && (
        <article className="flex flex-col gap-4 p-5">
          <header>
            <h3 className="text-lg font-semibold leading-snug">
              {message.subject || "(no subject)"}
            </h3>
            <dl className="mt-3 grid gap-1.5 text-sm text-muted">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-fg">From</dt>
                <dd className="min-w-0 break-all">
                  {message.sender_name && <span>{message.sender_name} </span>}
                  {message.sender_email && (
                    <span className="text-muted">&lt;{message.sender_email}&gt;</span>
                  )}
                  {!message.sender_name && !message.sender_email && "Unknown sender"}
                </dd>
              </div>
              {message.recipient && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-fg">To</dt>
                  <dd className="min-w-0 break-all">{message.recipient}</dd>
                </div>
              )}
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-fg">Received</dt>
                <dd>
                  <time dateTime={message.received_at}>{formatDateTime(message.received_at)}</time>
                </dd>
              </div>
            </dl>
            {message.labels?.length > 0 && (
              <ul aria-label="Message labels" className="mt-3 flex flex-wrap gap-1.5">
                {message.labels.map((label) => (
                  <li
                    key={label}
                    className="rounded-md border border-line bg-ink-800 px-1.5 py-0.5 text-xs text-muted"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </header>

          <div className="border-t border-line pt-4">
            {message.body_text ? (
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.body_text}
              </div>
            ) : (
              <p className="text-sm text-muted">This message has no plain-text body.</p>
            )}
          </div>

          <p className="border-t border-line pt-3 text-xs text-muted">
            Content is untrusted and shown as plain text. HTML, scripts and remote images are never
            rendered or loaded.
            {message.body_source === "html-derived" && " HTML was converted to plain text."}
          </p>
        </article>
      )}
    </Panel>
  );
}
