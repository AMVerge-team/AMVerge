import { invoke } from "@tauri-apps/api/core";
import { importClipsToDavinci } from "../davinci/resolveImport";
import { useAppStateStore } from "../../stores/appStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";

/**
 * What happens to files once an export finished: the DaVinci Resolve timeline
 * when the export panel's Resolve toggle is on, the file explorer otherwise.
 *
 * Single seam on purpose — every export path (full export, merged export, single
 * clip download) ends here, so a new destination is added in one place and the
 * DaVinci one is removed by deleting its branch.
 *
 * A failed hand-off still falls back to revealing the files: the export itself
 * succeeded, only the delivery did not.
 */
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
