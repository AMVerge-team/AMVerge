import { invoke } from "@tauri-apps/api/core";
import { importClipsToDavinci } from "../davinci/resolveImport";
import { useAppStateStore } from "../../stores/appStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";

/** delivers finished exports to Resolve when its toggle is on, else reveals them; the one seam for every export path */
export async function deliverExportedFiles(files: string[]): Promise<void> {
  if (files.length === 0) return;

  const settings = useGeneralSettingsStore.getState();

  if (settings.davinciResolveEnabled && settings.davinciExportSelected) {
    try {
      console.log("[export] " + (await importClipsToDavinci(files)));
      return;
    } catch (err) {
      const detail = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
      console.error("[export] DaVinci Resolve import failed:", err);
      const { setProgressMsg } = useAppStateStore.getState();
      setProgressMsg(`DaVinci Resolve import failed: ${detail}`);
      setTimeout(() => useAppStateStore.getState().setProgressMsg(""), 8000);
    }
  }

  if (settings.openFileLocationAfterExport) {
    await invoke("reveal_in_file_manager", { filePath: files[0] });
  }
}
