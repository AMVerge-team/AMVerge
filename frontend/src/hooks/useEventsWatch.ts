import { useEffect } from "react";

import { useEventsStore } from "../stores/eventsStore";

/** polls the events list so a new approval badges the sidebar; the CSP and api have no push channel */
const POLL_INTERVAL_MS = 60_000;

export default function useEventsWatch() {
  useEffect(() => {
    const store = useEventsStore.getState();

    // the baseline on a fresh install, the badge on launch for everyone else
    void store.refreshEvents();

    const timer = window.setInterval(() => {
      // skip while a foreground load runs so the two can't interleave
      if (useEventsStore.getState().loading) return;
      void useEventsStore.getState().refreshEvents();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);
}
