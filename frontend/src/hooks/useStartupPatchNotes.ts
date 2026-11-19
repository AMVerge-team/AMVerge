import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

import { t } from "../i18n";
import changelog from "../data/CHANGELOG.md?raw";
import type { StartupNotification } from "../components/dialogs/StartupNotificationModal";

const LAST_SEEN_VERSION_KEY = "amverge.lastSeenAppVersion";

function sectionForVersion(version: string): string | null {
  const wanted = `v${version.trim().replace(/^v/i, "")}`;
  const lines = changelog.split("\n");
  let collecting = false;
  const body: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# ") || line.startsWith("## ")) {
      if (collecting) break;
      const heading = line.replace(/^#+\s*/, "").trim();
      if (heading === wanted) {
        collecting = true;
      }
      continue;
    }
    if (collecting) {
      body.push(line);
    }
  }

  const text = body.join("\n").trim();
  return text || null;
}

export default function useStartupPatchNotes(): StartupNotification | null {
  const [notification, setNotification] = useState<StartupNotification | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      try {
        const currentVersion = (await getVersion()).trim().replace(/^v/i, "");
        const seenVersion = window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
        if (seenVersion === currentVersion) {
          return;
        }

        window.localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
        if (!seenVersion) {
          return;
        }

        const body = sectionForVersion(currentVersion);
        if (!body || cancelled) {
          return;
        }

        setNotification({
          id: `patch-notes-${currentVersion}`,
          mode: "update",
          title: t("jobs:patchNotesNotice.title", { version: currentVersion }),
          bodyMarkdown: body,
          bannerImageUrl: null,
          createdAt: null,
        });
      } catch (error) {
        console.error("[patch-notes] startup version check failed:", error);
      }
    };

    void checkVersion();

    return () => {
      cancelled = true;
    };
  }, []);

  return notification;
}
