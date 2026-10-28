import { ShieldCheck } from "lucide-react";

export default function SecurityNotice() {
  return (
    <aside
      aria-label="Security notice"
      className="flex gap-4 rounded-2xl border border-accent/40 bg-accent-strong/10 p-5"
    >
      <ShieldCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-accent" />
      <div>
        <h2 className="text-base font-semibold">Nothing is sent without your approval</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          When sending is added, MailPilot will only send an email after you review the draft and
          explicitly approve it. This is a design rule for later phases. No sending exists today.
        </p>
      </div>
    </aside>
  );
}
