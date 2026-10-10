import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { initConsoleCapture } from "./utils/appConsole";
import { applyThemeSettings, useThemeSettingsStore } from "./stores/settingsStore";

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
      `Starting update to v${update.version}. Download/install may take a bit on macOS.\n\nPlease keep AMVerge open until it completes.`,
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

// before React renders anything. App also applies this in an effect, which runs
// after the first paint, so the splash would show one frame of the default
// green accent before the user's own colour arrived. `persist` keeps the theme
// in localStorage, which is synchronous and already hydrated by now
// guarded: at module scope a throw here would take the whole render with it,
// where the same call inside App's effect could only cost the theme. App
// re-applies it either way, so failing quietly is the right trade
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
