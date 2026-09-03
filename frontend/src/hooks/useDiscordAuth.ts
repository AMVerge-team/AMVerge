import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

import { useEventsStore } from "../stores/eventsStore";
import type { DiscordLoginEvent } from "../components/events/types";

/**
 * keeps the Discord session in sync with Rust. mounted once at app level rather
 * than inside the events modal: the browser round-trip can finish after the user
 * has closed it, and the result still has to land somewhere.
 */
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
