import { Construction } from "lucide-react";
import EmptyState from "../components/EmptyState.jsx";

export default function ComingSoon({ item }) {
  return (
    <section aria-labelledby="page-title" className="rounded-2xl border border-line bg-ink-900 p-4">
      <h2 id="page-title" className="px-2 pt-2 text-xl font-semibold">{item.label}</h2>
      <EmptyState
        icon={Construction}
        title={`Not built yet. Planned for Phase ${item.phase}.`}
        description={item.blurb}
      />
    </section>
  );
}
