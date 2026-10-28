import { AlertTriangle } from "lucide-react";
import { API_BASE_URL } from "../lib/api.js";

export default function ErrorBanner({ onRetry }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
      <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
      <p className="min-w-0 flex-1">
        Can’t reach the MailPilot API at{" "}
        <code className="break-all rounded bg-ink-950 px-1.5 py-0.5">{API_BASE_URL}</code>. Start
        the backend with{" "}
        <code className="rounded bg-ink-950 px-1.5 py-0.5">uvicorn app.main:app --reload</code> and
        check <code className="rounded bg-ink-950 px-1.5 py-0.5">VITE_API_BASE_URL</code>.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-rose-300/40 px-3 py-1.5 font-semibold hover:bg-rose-400/10"
      >
        Retry
      </button>
    </div>
  );
}
