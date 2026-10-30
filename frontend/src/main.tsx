import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { initConsoleCapture } from "./utils/appConsole";
import { exportForV2, useV2UpgradeStore } from "./stores/v2UpgradeStore";
import { useEpisodePanelMetadataStore, useEpisodePanelRuntimeStore } from "./stores/episodeStore";

initConsoleCapture();

async function maybeCheckForUpdatesOnStartup() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return;
  }

  const platformInfo = `${navigator.platform} ${navigator.userAgent}`;
  if (/linux/i.test(platformInfo)) {
    console.info("[updater] skipping startup update check on Linux community build");
    return;
  }

  try {
    const [{ check }, { confirm, message }] = await Promise.all([
      import("@tauri-apps/plugin-updater"),
      import("@tauri-apps/plugin-dialog"),
    ]);

    const update = await check();
    if (!update) return;

    // AMVerge 2 gets its own modal, which carries settings and episodes over before installing
    if (update.version.startsWith("2.")) {
      useV2UpgradeStore.setState({ update });
      return;
    }

    const ok = await confirm(
      `A new update is available (v${update.version}). Install now?`,
      { title: "AMVerge Update" },
    );

    if (!ok) return;

    console.log(`[updater] starting install for v${update.version}`);
    await message(
      `Starting update to v${update.version}. Download/install may take a bit on macOS.\n\nPlease keep AMVerge open until it completes.`,
      { title: "AMVerge Update" },
    );

    await update.downloadAndInstall();
    console.log(`[updater] install finished for v${update.version}`);

    const isMacOS = /mac/i.test(platformInfo);
    if (isMacOS) {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } else {
      await message(
        `Update v${update.version} was installed.\n\nIf the app does not restart automatically, please close and reopen AMVerge.`,
        { title: "AMVerge Update Installed" },
      );
    }
  } catch (error) {
    // Show a visible error instead of silently dismissing the update flow.
    const [{ message }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
    ]);

    const errorText = error instanceof Error ? `${error.name}: ${error.message}` : "Update download/install failed.";
    console.error("[updater] update flow failed:", error);
    await message(
      `Could not install the update. ${errorText}`,
      { title: "AMVerge Update Failed" },
    );
  }
}

void maybeCheckForUpdatesOnStartup();

// kept fresh on every launch, so AMVerge 2 can import it however it gets installed
async function prepareForV2() {
  if (!("__TAURI_INTERNALS__" in window)) return;
  try {
    await exportForV2();
  } catch (error) {
    console.error("[v2-upgrade] could not export data for AMVerge 2:", error);
  }
}

void prepareForV2();

// re-export after library changes, so episodes imported this session carry over too
let exportTimer: number | undefined;
function scheduleExportForV2() {
  window.clearTimeout(exportTimer);
  // waits for persist to finish writing, since the export reads the saved copy
  exportTimer = window.setTimeout(() => {
    exportForV2().catch((error) => console.error("[v2-upgrade] could not export data for AMVerge 2:", error));
  }, 2000);
}

if ("__TAURI_INTERNALS__" in window) {
  useEpisodePanelRuntimeStore.subscribe((state, prev) => {
    if (state.episodes !== prev.episodes) scheduleExportForV2();
  });
  useEpisodePanelMetadataStore.subscribe(scheduleExportForV2);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
