import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { StartupNotification } from "../components/StartupNotificationModal";

type GitHubLatestRelease = {
  tag_name?: string;
};

const GITHUB_LATEST_RELEASE_ENDPOINT = "https://api.github.com/repos/crptk/AMVerge/releases/latest";
const FORCE_UPDATE_NOTIFICATION_FOR_DEV = false;

function normalizeVersion(rawVersion: string): string {
  return rawVersion.trim().replace(/^v/i, "");
}

function parseVersionParts(version: string): number[] {
  const normalized = normalizeVersion(version);
  const [core] = normalized.split("-");
  const rawParts = core.split(".");
  const parts = rawParts.map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return [];
  }

  return parts;
}

// Returns: -1 if current < latest, 0 if equal, 1 if current > latest.
function compareVersions(currentVersion: string, latestVersion: string): number {
  const currentParts = parseVersionParts(currentVersion);
  const latestParts = parseVersionParts(latestVersion);

  if (currentParts.length === 0 || latestParts.length === 0) {
    return 0;
  }

  const maxLength = Math.max(currentParts.length, latestParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const current = currentParts[index] ?? 0;
    const latest = latestParts[index] ?? 0;

    if (current < latest) {
      return -1;
    }

    if (current > latest) {
      return 1;
    }
  }

  return 0;
}

async function fetchLatestGitHubVersion(): Promise<string | null> {
  const response = await fetch(GITHUB_LATEST_RELEASE_ENDPOINT, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    throw new Error(`GitHub latest release request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as GitHubLatestRelease;
  const tag = typeof payload.tag_name === "string" ? normalizeVersion(payload.tag_name) : "";
  return tag || null;
}

export default function useStartupUpdateNotification(): StartupNotification | null {
  const [notification, setNotification] = useState<StartupNotification | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const [currentVersion, latestVersion] = await Promise.all([
          getVersion(),
          fetchLatestGitHubVersion(),
        ]);

        if (cancelled || !latestVersion) {
          return;
        }

        const forced = FORCE_UPDATE_NOTIFICATION_FOR_DEV;
        const isOutdated = compareVersions(currentVersion, latestVersion) < 0;
        if (!forced && !isOutdated) {
          return;
        }

        if (forced) {
          console.info("[update-notification] forced startup popup enabled for testing");
        }

        setNotification({
          id: `github-update-${latestVersion}`,
          mode: "update",
          targetVersion: latestVersion,
          title: "Update Available",
          bodyMarkdown:
            "There's a new update for AMVerge! Feel free to download it [here](https://amverge.app/).",
          bannerImageUrl: null,
          createdAt: null,
        });
      } catch (error) {
        console.error("[update-notification] startup version check failed:", error);
      }
    };

    void checkForUpdate();

    return () => {
      cancelled = true;
    };
  }, []);

  return notification;
}
