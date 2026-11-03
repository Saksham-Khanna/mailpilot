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
  return { label: name.charAt(0).toUpperCase(), bg: "from-indigo-600 to-purple-600" };
}

function getCategoryBadge(message) {
  const subject = (message.subject || "").toLowerCase();
  if (subject.includes("intern") || subject.includes("engineer") || subject.includes("opportunity") || subject.includes("role") || subject.includes("developer") || subject.includes("sde")) {
    return { label: "Opportunity", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" };
  }
  if (subject.includes("interview") || subject.includes("schedule") || subject.includes("invitation")) {
    return { label: "High Priority", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
  }
  if (subject.includes("reply") || subject.includes("question") || subject.includes("availability") || subject.includes("challenge")) {
    return { label: "Needs Reply", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  }
  return { label: "Update", color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" };
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
    <div className="flex flex-col h-full bg-[#13151e] rounded-2xl border border-[#232638] overflow-hidden shadow-sm">
      {loading && (
        <div className="flex items-center gap-2 p-8 text-sm text-muted" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-accent" />
          Loading synchronized messages…
        </div>
      )}

      {!loading && error && (
        <div className="p-6">
          <p role="alert" className="text-sm text-rose-100">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#232638] px-3 py-1.5 text-sm font-semibold hover:border-accent/50 bg-[#151722]"
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
          <div className="divide-y divide-[#232638] overflow-y-auto max-h-[640px]" aria-label="Synchronized messages">
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
                    selected ? "bg-purple-900/20 border-l-4 border-purple-500" : "hover:bg-[#181b28]"
                  }`}
                >
                  <button type="button" className="text-muted hover:text-fg" onClick={(e) => e.stopPropagation()}>
                    <Square className="size-4" />
                  </button>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-white font-bold text-xs shadow-inner ${brand.bg.startsWith("bg-") ? brand.bg : `bg-gradient-to-br ${brand.bg}`}`}>
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
                  <button type="button" className="text-muted hover:text-amber-300 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Star className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="border-t border-[#232638] px-4 py-3.5 text-xs text-muted flex items-center justify-between bg-[#10121a]">
            <span>Showing 1–{items.length} of {total || 1428} stored messages.</span>
            <div className="flex items-center gap-1.5 font-medium">
              <span className="px-2.5 py-1 rounded-lg bg-accent-strong text-white text-xs shadow">1</span>
              <span className="px-2.5 py-1 hover:bg-[#181b28] rounded-lg cursor-pointer">2</span>
              <span className="px-2.5 py-1 hover:bg-[#181b28] rounded-lg cursor-pointer">3</span>
              <span className="text-muted">...</span>
              <span className="px-2.5 py-1 hover:bg-[#181b28] rounded-lg cursor-pointer">58</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
