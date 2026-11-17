import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { initConsoleCapture } from "./utils/appConsole";
import { applyThemeSettings, useThemeSettingsStore } from "./stores/settingsStore";
import { importFromV1 } from "./features/migration/importV1";
import { waitForEpisodes } from "./stores/episodeStore";
import { rebaseStoragePaths } from "./features/storage/rebaseStoragePaths";
import { restoreLastOpenedEpisode } from "./hooks/useEpisodePanelState";
import { askNotice, showNotice } from "./features/notice/notice";

initConsoleCapture();
// macos uses the native window frame and traffic lights
if (navigator.userAgent.includes("Mac OS X")) document.documentElement.dataset.platform = "mac";

async function maybeCheckForUpdatesOnStartup() {
  // In dev builds (`import.meta.env.DEV`) or without Tauri internals, skip update checking:
  // dev mode has no packaged bundle/updater artifacts, and testing unreleased platforms
  // (like Linux before its first release) would otherwise fail with target not found.
  if (import.meta.env.DEV || typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return;
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");

    const update = await check();
    if (!update) return;

    const ok = await askNotice(
      "AMVerge Update",
      `A new update is available (v${update.version}). Install now?`,
      "Install",
    );

    if (!ok) return;

    console.log(`[updater] starting install for v${update.version}`);
    await showNotice(
      "AMVerge Update",
      `Starting update to v${update.version}.\n\nPlease keep the app open until it completes.`,
    );

    await update.downloadAndInstall();
    console.log(`[updater] install finished for v${update.version}`);

    await showNotice(
      "AMVerge Update Installed",
      `Update v${update.version} was installed.\n\nIf the app does not restart automatically on macOS, please close and reopen AMVerge once.`,
    );
  } catch (error) {
    // show a visible error instead of silently dismissing the update flow
    const errorText = error instanceof Error ? `${error.name}: ${error.message}` : "Update download/install failed.";
    console.error("[updater] update flow failed:", error);
    await showNotice("AMVerge Update Failed", `Could not install the update. ${errorText}`);
  }
}

void maybeCheckForUpdatesOnStartup();

// applies the theme before the first paint so the splash never flashes the default accent; guarded, App re-applies it
async function bootstrap() {
  // the logo font loads before the first paint, or the wordmark flashes in the fallback font
  const logoFont = Promise.race([
    document.fonts.load("1em 'Jersey 10'", "AMVerge").catch(() => []),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);

  // the episode list loads from IndexedDB asynchronously; the app reads it on its first render
  await Promise.all([waitForEpisodes(), logoFont]);

  // before the first render, so every store starts out already holding what came over from V1
  try {
    await importFromV1();
  } catch (err) {
    console.error("[migration] import from AMVerge 1 failed", err);
  }

  // repairs paths an earlier storage move left pointing at the wrong folder; a correct library writes nothing
  if ("__TAURI_INTERNALS__" in window) {
    try {
      await rebaseStoragePaths();
    } catch (err) {
      console.error("[storage] could not check episode paths", err);
    }
  }

  // the last session's episode is open from the first frame, on any page, so the launch reveal plays it
  try {
    restoreLastOpenedEpisode();
  } catch (err) {
    console.warn("Could not reopen the last episode", err);
  }

  try {
    applyThemeSettings(useThemeSettingsStore.getState());
  } catch (err) {
    console.warn("Could not pre-apply theme settings", err);
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
