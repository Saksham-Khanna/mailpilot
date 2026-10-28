import { useCallback, useEffect, useRef, useState } from "react";
import { getGmailStatus, getSession } from "./api.js";

/**
 * Loads the development session (CSRF token) and the real Gmail connection
 * status. The session cookie is HttpOnly; the CSRF token stays in memory only.
 */
export function useGmailConnection() {
  const [state, setState] = useState("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setRefreshing(true);
    setError("");
    try {
      const nextSession = await getSession();
      const nextStatus = await getGmailStatus();
      if (id !== requestId.current) return;
      setSession(nextSession);
      setStatus(nextStatus);
      setState("ready");
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err?.detail || err?.message || "Could not load the Gmail connection.");
      setState("error");
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  return {
    state,
    refreshing,
    error,
    status,
    csrfToken: session?.csrf_token || null,
    refresh,
  };
}
