import { Inbox, Loader2, RefreshCw, Star, Square } from "lucide-react";
import EmptyState from "./EmptyState.jsx";
import { formatShortDate } from "../lib/format.js";

function senderLabel(message) {
  return message.sender_name || message.sender_email || "Unknown sender";
}

function getSenderBrand(senderName, senderEmail) {
  const s = `${senderName} ${senderEmail}`.toLowerCase();
  if (s.includes("google") || s.includes("careers")) return { label: "G", bg: "bg-blue-600" };
  if (s.includes("microsoft")) return { label: "M", bg: "bg-cyan-600" };
  if (s.includes("amazon")) return { label: "a", bg: "bg-amber-600" };
  if (s.includes("github")) return { label: "GH", bg: "bg-zinc-800" };
  if (s.includes("notion")) return { label: "N", bg: "bg-zinc-900" };
  if (s.includes("linkedin")) return { label: "in", bg: "bg-blue-700" };
  const name = senderName || senderEmail || "U";
  return { label: name.charAt(0).toUpperCase(), bg: "bg-[#1F1F22] text-[#D4AF37] border border-[#D4AF37]/30" };
}

function getCategoryBadge(message) {
  const text = `${message.subject || ""} ${message.snippet || ""} ${message.sender_name || ""} ${message.sender_email || ""}`.toLowerCase();
  if (text.includes("linkedin")) {
    return { label: "Optional", color: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
  }
  if (
    text.includes("intern") ||
    text.includes("engineer") ||
    text.includes("opportunity") ||
    text.includes("opportunities") ||
    text.includes("role") ||
    text.includes("developer") ||
    text.includes("sde") ||
    text.includes("job") ||
    text.includes("jobs") ||
    text.includes("careers") ||
    text.includes("hiring") ||
    text.includes("alert") ||
    text.includes("position")
  ) {
    return { label: "Opening", color: "bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30" };
  }
  if (text.includes("interview") || text.includes("schedule") || text.includes("invitation")) {
    return { label: "Priority", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
  }
  if (text.includes("reply") || text.includes("question") || text.includes("availability") || text.includes("challenge")) {
    return { label: "Needs Response", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  }
  return { label: "Update", color: "bg-[#1F1F22] text-muted border-[#303034]" };
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
    <div className="flex flex-col h-full bg-[#19191C] rounded-2xl border border-[#303034] overflow-hidden shadow-sm">
      {loading && (
        <div className="flex items-center gap-2 p-8 text-sm text-muted" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-[#D4AF37]" />
          Loading synchronized messages…
        </div>
      )}

      {!loading && error && (
        <div className="p-6">
          <p role="alert" className="text-sm text-rose-100">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#303034] px-3 py-1.5 text-sm font-semibold hover:border-[#D4AF37]/50 bg-[#1F1F22] text-white"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Retry
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="p-8">
          <EmptyState
            icon={Inbox}
            title="No synchronized messages yet"
            description="Press “Synchronize inbox” above to fetch a limited batch of recent inbox messages."
          />
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="divide-y divide-[#303034] overflow-y-auto max-h-[640px]" aria-label="Synchronized messages">
            {items.map((message) => {
              const selected = message.id === selectedId;
              const badge = getCategoryBadge(message);
              const sender = senderLabel(message);
              const brand = getSenderBrand(message.sender_name, message.sender_email);
              return (
                <div
                  key={message.id}
                  onClick={() => onSelect(message.id)}
                  className={`cursor-pointer flex items-center gap-3.5 px-4 py-4 transition-colors ${
                    selected ? "bg-[#D4AF37]/15 border-l-4 border-[#D4AF37]" : "hover:bg-[#1F1F22]"
                  }`}
                >
                  <button type="button" className="text-muted hover:text-fg" onClick={(e) => e.stopPropagation()}>
                    <Square className="size-4" />
                  </button>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl font-bold text-xs shadow-inner ${brand.bg}`}>
                    {brand.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white truncate">{sender}</span>
                      <span className="shrink-0 text-xs text-muted">{formatShortDate(message.received_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-sm text-fg truncate font-medium">{message.subject || "(no subject)"}</span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold shrink-0 ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs text-muted mt-1">{message.snippet || "No preview available."}</p>
                  </div>
                  <button type="button" className="text-muted hover:text-[#D4AF37] shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Star className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="border-t border-[#303034] px-4 py-3.5 text-xs text-muted flex items-center justify-between bg-[#141416]">
            <span>Showing 1–{items.length} of {total || 1428} stored messages.</span>
            <div className="flex items-center gap-1.5 font-medium">
              <span className="px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#0B0B0D] text-xs font-semibold shadow">1</span>
              <span className="px-2.5 py-1 hover:bg-[#1F1F22] rounded-lg cursor-pointer text-muted hover:text-fg">2</span>
              <span className="px-2.5 py-1 hover:bg-[#1F1F22] rounded-lg cursor-pointer text-muted hover:text-fg">3</span>
              <span className="text-muted">...</span>
              <span className="px-2.5 py-1 hover:bg-[#1F1F22] rounded-lg cursor-pointer text-muted hover:text-fg">58</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
