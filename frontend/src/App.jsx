import { useCallback, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { Menu } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import Overview from "./pages/Overview.jsx";
import Inbox from "./pages/Inbox.jsx";
import Opportunities from "./pages/Opportunities.jsx";
import Drafts from "./pages/Drafts.jsx";
import ActivityLogs from "./pages/ActivityLogs.jsx";
import Settings from "./pages/Settings.jsx";
import ComingSoon from "./pages/ComingSoon.jsx";
import { NAV_ITEMS } from "./lib/navigation.js";
import { useBackendHealth } from "./lib/useBackendHealth.js";
import { useGmailConnection } from "./lib/useGmailConnection.js";

/** Minimal hash router (#/inbox). Swap for react-router once pages have real data. */
function useHashRoute() {
  const read = () => {
    const id = window.location.hash.replace(/^#\/?/, "");
    return NAV_ITEMS.some((n) => n.id === id) ? id : "overview";
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const health = useBackendHealth();
  const gmail = useGmailConnection();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const item = NAV_ITEMS.find((n) => n.id === route);

  let page;
  if (item.id === "inbox") {
    page = <Inbox gmail={gmail} health={health} />;
  } else if (item.id === "opportunities") {
    page = <Opportunities gmail={gmail} health={health} />;
  } else if (item.id === "drafts") {
    page = <Drafts gmail={gmail} health={health} />;
  } else if (item.id === "logs") {
    page = <ActivityLogs health={health} />;
  } else if (item.id === "settings") {
    page = <Settings gmail={gmail} health={health} />;
  } else if (item.implemented) {
    page = <Overview health={health} gmail={gmail} />;
  } else {
    page = <ComingSoon item={item} />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent-strong focus:px-3 focus:py-2"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="flex min-h-full">
        <Sidebar active={route} mobileOpen={menuOpen} onCloseMobile={closeMenu} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <div className="flex items-center gap-3 border-b border-line bg-ink-950 px-4 py-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-line p-2 text-muted hover:text-fg"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <span className="font-bold text-white tracking-tight">MailPilot</span>
          </div>

          <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-8">
            {page}
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
