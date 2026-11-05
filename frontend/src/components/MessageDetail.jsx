import { useState } from "react";
import { Loader2, Mail, RefreshCw, Reply, Forward, Archive, Trash2, Star, MoreVertical, CheckCircle, ExternalLink } from "lucide-react";
import Panel from "./Panel.jsx";
import EmptyState from "./EmptyState.jsx";
import { formatDateTime } from "../lib/format.js";

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

export default function MessageDetail({ message, loading, error, onRetry }) {
  const [starred, setStarred] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[#19191C] rounded-2xl border border-[#303034] overflow-hidden shadow-sm">
      {loading && (
        <div className="flex items-center gap-2 p-8 text-sm text-muted" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-[#D4AF37]" />
          Loading message…
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

      {!loading && !error && !message && (
        <div className="p-8">
          <EmptyState
            icon={Mail}
            title="Select a message"
            description="Choose a synchronized message to read its subject and content."
          />
        </div>
      )}

      {!loading && !error && message && (
        <div className="flex flex-col h-full">
          {/* Top Toolbar */}
          <div className="flex items-center justify-between border-b border-[#303034] px-5 py-3.5 bg-[#141416]">
            <div className="flex items-center gap-3 text-muted">
              <button type="button" title="Reply" onClick={() => window.location.hash = "#/drafts"} className="hover:text-fg p-1.5 rounded-lg hover:bg-[#1F1F22] transition-colors"><Reply className="size-4" /></button>
              <button type="button" title="Forward" onClick={() => {}} className="hover:text-fg p-1.5 rounded-lg hover:bg-[#1F1F22] transition-colors"><Forward className="size-4" /></button>
              <button type="button" title="Archive" onClick={() => {}} className="hover:text-fg p-1.5 rounded-lg hover:bg-[#1F1F22] transition-colors"><Archive className="size-4" /></button>
              <button type="button" title="Delete" onClick={() => {}} className="hover:text-fg p-1.5 rounded-lg hover:bg-[#1F1F22] transition-colors"><Trash2 className="size-4" /></button>
            </div>
            <div className="flex items-center gap-3 text-muted">
              <button type="button" title="Star" onClick={() => setStarred(!starred)} className="hover:text-[#D4AF37] p-1.5 rounded-lg hover:bg-[#1F1F22] transition-colors">
                <Star className={`size-4 ${starred ? "fill-[#D4AF37] text-[#D4AF37]" : ""}`} />
              </button>
              <button type="button" title="More" onClick={() => {}} className="hover:text-fg p-1.5 rounded-lg hover:bg-[#1F1F22] transition-colors"><MoreVertical className="size-4" /></button>
            </div>
          </div>

          {/* Email Content */}
          <article className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 max-h-[580px]">
            <header>
              <h3 className="text-xl font-bold leading-snug text-white">
                {message.subject || "(no subject)"}
              </h3>
              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {(() => {
                    const brand = getSenderBrand(message.sender_name, message.sender_email);
                    return (
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl font-bold text-sm shadow-inner ${brand.bg}`}>
                        {brand.label}
                      </span>
                    );
                  })()}
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {message.sender_name && <span>{message.sender_name} </span>}
                      {message.sender_email && (
                        <span className="text-muted font-normal">&lt;{message.sender_email}&gt;</span>
                      )}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      To: {message.recipient || "me@example.com"}
                    </p>
                  </div>
                </div>
                <time dateTime={message.received_at} className="text-xs text-muted">
                  {formatDateTime(message.received_at)}
                </time>
              </div>

              {message.labels?.length > 0 && (
                <ul aria-label="Message labels" className="mt-4 flex flex-wrap gap-1.5">
                  {message.labels.map((label) => (
                    <li
                      key={label}
                      className="rounded-md border border-[#303034] bg-[#1F1F22] px-2 py-0.5 text-xs text-muted"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </header>

            <div className="border-t border-[#303034] pt-6">
              {message.body_text ? (
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg font-sans">
                  {message.body_text}
                </div>
              ) : (
                <p className="text-sm text-muted">This message has no plain-text body.</p>
              )}
            </div>

            {/* Simulated Key Details box for career/opportunity emails matching Image 1 */}
            <div className="rounded-xl border border-[#303034] bg-[#1F1F22] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37] mb-2">Key Details:</p>
              <ul className="space-y-1.5 text-xs text-muted">
                <li>• Role: {message.subject || "Software Engineering Intern"}</li>
                <li>• Duration: May 2026 – Jul 2026</li>
                <li>• Location: Remote / Hybrid</li>
              </ul>
              <div className="mt-4 pt-3 border-t border-[#303034] flex items-center justify-between">
                <a
                  href="#/opportunities"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5D77A] shadow"
                >
                  Apply Now <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>

            <p className="border-t border-[#303034] pt-4 text-xs text-muted">
              Content is untrusted and shown as plain text. HTML, scripts and remote images are never rendered or loaded.
            </p>
          </article>

          {/* Bottom Action Bar */}
          <div className="border-t border-[#303034] p-4 bg-[#141416] flex items-center justify-between gap-3">
            <a
              href="#/drafts"
              className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#0B0B0D] shadow-lg transition-colors hover:bg-[#F5D77A]"
            >
              <Mail className="size-4" /> Generate Reply Draft
            </a>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[#303034] bg-[#1F1F22] px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-[#2A2A2E]"
            >
              <CheckCircle className="size-4 text-emerald-400" /> Mark as Read
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
