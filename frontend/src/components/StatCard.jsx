import { motion } from "framer-motion";

/** `value` of null renders an explicit "unavailable" state instead of a fake number. */
export default function StatCard({ label, icon: Icon, value = null, note, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07 }}
      className="rounded-2xl border border-line bg-ink-900 p-5"
    >
      <dl>
        <div className="flex items-center justify-between">
          <dt className="text-sm font-medium text-muted">{label}</dt>
          <Icon aria-hidden="true" className="size-4 text-accent" />
        </div>
        <dd className="mt-3 text-3xl font-bold tabular-nums">
          {value ?? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">Unavailable</span>
            </>
          )}
        </dd>
        <dd className="mt-1 text-xs text-muted">{note}</dd>
      </dl>
    </motion.div>
  );
}
