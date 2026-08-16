import { invoke } from "@tauri-apps/api/core";
import { useScenepacksStore } from "../stores/scenepackStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";

/**
 * Wipes all Scenepack UI state and asks the backend to delete every
 * materialized clip on disk. Used by the General Settings "Clear Scenepack
 * Storage" button and the disable-Scenepacks confirmation flow.
 */
export async function clearScenepacksStorage(): Promise<void> {
  useScenepacksStore.getState().resetScenepacks();

  try {
    const customPath = useGeneralSettingsStore.getState().episodesPath;
    await invoke("clear_scenepacks_storage", { customPath });
  } catch (err) {
    console.error("clear_scenepacks_storage failed:", err);
    throw err;
  }
}
