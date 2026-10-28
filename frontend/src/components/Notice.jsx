import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const TONES = {
  success: {
    icon: CheckCircle2,
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    role: "status",
  },
  error: {
    icon: AlertTriangle,
    className: "border-rose-400/30 bg-rose-400/10 text-rose-100",
    role: "alert",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    role: "alert",
  },
  info: {
    icon: Info,
    className: "border-accent/40 bg-accent-strong/10 text-fg",
    role: "status",
  },
};

/** Text-only notice. Never renders HTML (email content stays plain text). */
export default function Notice({ tone = "info", children, onDismiss }) {
  const config = TONES[tone] || TONES.info;
  const Icon = config.icon;
  return (
    <div
      role={config.role}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${config.className}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="rounded-md p-1 opacity-80 hover:opacity-100"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
