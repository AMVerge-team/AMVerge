import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

import { useEventsStore } from "../stores/eventsStore";
import type { DiscordLoginEvent } from "../components/events/types";

/** keeps the Discord session in sync with rust; app-level since a login can finish after the modal closed */
export default function useDiscordAuth() {
  useEffect(() => {
    void useEventsStore.getState().refreshSession();

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void listen<DiscordLoginEvent>("discord-login", (event) => {
      const { profile, message } = event.payload;
      useEventsStore.getState().finishLogin(profile, message);
    }).then((stop) => {
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
