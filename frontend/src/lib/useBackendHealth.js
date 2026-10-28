import { useCallback, useEffect, useState } from "react";
import { getHealth } from "./api.js";

const DEFAULT_INTERVAL_MS = 30000;

/**
 * Checks `GET /api/health` on mount and then every `intervalMs`, so the header
 * cannot keep claiming "Connected" after the backend goes away.
 *
 * Returns { state: "checking" | "online" | "offline", info, retry }.
 */
export function useBackendHealth({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const [state, setState] = useState("checking");
  const [info, setInfo] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const check = async (showChecking) => {
      if (showChecking) setState("checking");
      try {
        const data = await getHealth({ signal: controller.signal });
        if (cancelled) return;
        if (data?.status !== "ok") throw new Error("Unexpected health response");
        setInfo(data);
        setState("online");
      } catch {
        // Ignore aborts caused by unmount/retry; those have a newer check.
        if (!cancelled && !controller.signal.aborted) {
          setInfo(null);
          setState("offline");
        }
      }
    };

    check(true);
    const timer = setInterval(() => check(false), intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
      controller.abort();
    };
  }, [attempt, intervalMs]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, info, retry };
}
