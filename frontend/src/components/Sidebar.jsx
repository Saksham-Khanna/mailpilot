import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mails, X } from "lucide-react";
import { NAV_ITEMS } from "../lib/navigation.js";

function NavContent({ active, onNavigate, onClose }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4 bg-[#141416]">
      <div className="flex items-center justify-between px-2 pt-1">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37]">
            <Mails aria-hidden="true" className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight text-white">MailPilot</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-lg p-2 text-muted hover:text-fg"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>

      <nav aria-label="Primary">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon, implemented, phase }) => {
            const isActive = active === id;
            return (
              <li key={id}>
                <a
                  href={`#/${id}`}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#D4AF37]/15 text-[#D4AF37] ring-1 ring-[#D4AF37]/40 font-semibold"
                      : "text-muted hover:bg-[#1F1F22] hover:text-fg"
                  }`}
                >
                  <Icon aria-hidden="true" className={`size-[18px] ${isActive ? "text-[#D4AF37]" : "text-muted"}`} />
                  <span className="flex-1">{label}</span>
                  {!implemented && (
                    <span className="rounded-md bg-[#1F1F22] px-1.5 py-0.5 text-xs text-muted">
                      Phase {phase}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="mt-auto px-2 text-xs leading-relaxed text-muted">
        Phase 2: read-only Gmail sync. AI features and email sending are not built yet.
      </p>
    </div>
  );
}

export default function Sidebar({ active, mobileOpen, onCloseMobile }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && onCloseMobile();
    document.addEventListener("keydown", onKey);
    drawerRef.current?.querySelector("button, a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-[#303034] bg-[#141416] lg:block">
        <div className="sticky top-0 h-screen">
          <NavContent active={active} />
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              aria-hidden="true"
            />
            <motion.aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-[#303034] bg-[#141416]"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.2 }}
            >
              <NavContent active={active} onNavigate={onCloseMobile} onClose={onCloseMobile} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
