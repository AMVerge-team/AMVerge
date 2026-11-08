import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { initConsoleCapture } from "./utils/appConsole";
import { applyThemeSettings, useThemeSettingsStore } from "./stores/settingsStore";
import { importFromV1 } from "./features/migration/importV1";
import { waitForEpisodes } from "./stores/episodeStore";
import { rebaseStoragePaths } from "./features/storage/rebaseStoragePaths";

initConsoleCapture();

async function maybeCheckForUpdatesOnStartup() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return;
  }

  try {
    const [{ check }, { confirm, message }] = await Promise.all([
      import("@tauri-apps/plugin-updater"),
      import("@tauri-apps/plugin-dialog"),
    ]);

    const update = await check();
    if (!update) return;

    const ok = await confirm(
      `A new update is available (v${update.version}). Install now?`,
      { title: "AMVerge Update" },
    );

    if (!ok) return;

    console.log(`[updater] starting install for v${update.version}`);
    await message(
      `Starting update to v${update.version}. \n\nPlease keep the app open until it completes.`,
      { title: "AMVerge Update" },
    );

    await update.downloadAndInstall();
    console.log(`[updater] install finished for v${update.version}`);

    await message(
      `Update v${update.version} was installed.\n\nIf the app does not restart automatically on macOS, please close and reopen AMVerge once.`,
      { title: "AMVerge Update Installed" },
    );
  } catch (error) {
    // show a visible error instead of silently dismissing the update flow
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
