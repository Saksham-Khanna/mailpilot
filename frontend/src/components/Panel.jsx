import { useId } from "react";

export default function Panel({ title, icon: Icon, className = "", children }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`rounded-2xl border border-[#303034] bg-[#19191C] ${className}`}
    >
      <h2 id={id} className="flex items-center gap-2 border-b border-[#303034] px-5 py-4 text-base font-semibold text-white">
        <Icon aria-hidden="true" className="size-4 text-[#D4AF37]" />
        {title}
      </h2>
      {children}
    </section>
  );
}
