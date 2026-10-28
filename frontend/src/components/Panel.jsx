import { useId } from "react";

export default function Panel({ title, icon: Icon, className = "", children }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`rounded-2xl border border-line bg-ink-900 ${className}`}
    >
      <h2 id={id} className="flex items-center gap-2 border-b border-line px-5 py-4 text-base font-semibold">
        <Icon aria-hidden="true" className="size-4 text-accent" />
        {title}
      </h2>
      {children}
    </section>
  );
}
