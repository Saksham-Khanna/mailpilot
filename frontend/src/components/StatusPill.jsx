const TONES = {
  good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  bad: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  neutral: "border-line bg-ink-800 text-muted",
  pending: "border-amber-300/30 bg-amber-300/10 text-amber-100",
};

/** Small labelled status indicator. Meaning is carried by the label text, not color alone. */
export default function StatusPill({ icon: Icon, label, value, tone = "neutral", children }) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${TONES[tone]}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>
        <span className="text-muted">{label}: </span>
        <span className="font-semibold">{value}</span>
      </span>
      {children}
    </div>
  );
}
