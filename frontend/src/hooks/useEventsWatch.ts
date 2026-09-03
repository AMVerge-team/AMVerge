import { useEffect } from "react";

import { useEventsStore } from "../stores/eventsStore";

/**
 * keeps the events list warm while the app is open, so a newly approved event
 * badges the sidebar without the user having to visit the page first
 *
 * polling rather than a push connection: the webview's CSP blocks every remote
 * host, so a socket would have to live in Rust and be bridged back, and the API
 * has no push channel to connect to. a quiet refresh on an interval gets the
 * same result for a feature measured in minutes, not milliseconds.
 */
const POLL_INTERVAL_MS = 60_000;

export default function useEventsWatch() {
  useEffect(() => {
    const store = useEventsStore.getState();

    // establishes the baseline on a fresh install, and populates the badge on
    // launch for everyone else
    void store.refreshEvents();

    const timer = window.setInterval(() => {
      // skip while a foreground load is already running, so the two cannot
      // interleave and leave the list half-updated
      if (useEventsStore.getState().loading) return;
      void useEventsStore.getState().refreshEvents();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);
}
