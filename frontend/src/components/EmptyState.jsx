export default function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-ink-800 text-accent">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>
    </div>
  );
}
