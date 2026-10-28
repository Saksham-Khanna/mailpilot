import { Inbox, Loader2, RefreshCw } from "lucide-react";
import Panel from "./Panel.jsx";
import EmptyState from "./EmptyState.jsx";
import { formatShortDate } from "../lib/format.js";

function senderLabel(message) {
  return message.sender_name || message.sender_email || "Unknown sender";
}

export default function MessageList({
  items,
  total,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
}) {
  return (
    <Panel title="Synchronized inbox" icon={Inbox}>
      {loading && (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Loading synchronized messages…
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

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No synchronized messages yet"
          description="Press “Synchronize inbox” above to fetch a limited batch of recent inbox messages."
        />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <ul className="divide-y divide-line" aria-label="Synchronized messages">
            {items.map((message) => {
              const selected = message.id === selectedId;
              return (
                <li key={message.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(message.id)}
                    aria-pressed={selected}
                    className={`flex w-full flex-col gap-1 px-4 py-3.5 text-left transition-colors ${
                      selected ? "bg-accent-strong/15" : "hover:bg-ink-800"
                    }`}
                  >
                    <span className="flex w-full items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {senderLabel(message)}
                      </span>
                      <time
                        dateTime={message.received_at}
                        className="shrink-0 text-xs text-muted"
                      >
                        {formatShortDate(message.received_at)}
                      </time>
                    </span>
                    <span className="w-full truncate text-sm">
                      {message.subject || "(no subject)"}
                    </span>
                    <span className="line-clamp-2 w-full text-xs leading-relaxed text-muted">
                      {message.snippet || "No preview available."}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            Showing {items.length} of {total} stored message{total === 1 ? "" : "s"}.
          </p>
        </>
      )}
    </Panel>
  );
}
