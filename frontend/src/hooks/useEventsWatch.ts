import { useEffect } from "react";

import { useEventsStore } from "../stores/eventsStore";

/** polls the events list so a new approval badges the sidebar; the CSP and api have no push channel */
const POLL_INTERVAL_MS = 60_000;
const FOCUS_REFRESH_COOLDOWN_MS = 5_000;

export default function useEventsWatch() {
  useEffect(() => {
    const store = useEventsStore.getState();
    let lastRefreshAt = Date.now();

    const refreshIfDue = () => {
      const now = Date.now();
      if (now - lastRefreshAt < FOCUS_REFRESH_COOLDOWN_MS) return;
      if (useEventsStore.getState().loading) return;
      lastRefreshAt = now;
      void useEventsStore.getState().refreshEvents();
    };

    // the baseline on a fresh install, the badge on launch for everyone else
    void store.refreshEvents();

    const timer = window.setInterval(() => {
      // skip while a foreground load runs so the two can't interleave
      if (useEventsStore.getState().loading) return;
      lastRefreshAt = Date.now();
      void useEventsStore.getState().refreshEvents();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfDue();
    };

    window.addEventListener("focus", refreshIfDue);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfDue);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
