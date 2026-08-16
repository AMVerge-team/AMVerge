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

/**
 * Remove clips from the opened Scenepack and delete their materialized files.
 *
 * `indexes` are positions in the pack's clip array. They are dropped in a
 * single pass, because splicing one at a time would shift every later index.
 * Legacy entries with no clipPath never had a file of their own, so only real
 * paths are handed to the backend.
 */
export async function removeClipsFromScenepack(
  scenepackId: string,
  clips: Array<{ index: number; clipPath?: string }>,
): Promise<void> {
  if (clips.length === 0) return;

  const indexes = clips.map((c) => c.index);
  const clipPaths = clips.map((c) => c.clipPath).filter((p): p is string => Boolean(p));

  useScenepacksStore.getState().removeClipsFromScenepackByIndexes(scenepackId, indexes);

  if (clipPaths.length === 0) return;

  try {
    await invoke("delete_scenepack_clip_files", {
      scenepackId,
      clipPaths,
      customPath: useGeneralSettingsStore.getState().episodesPath,
    });
  } catch (err) {
    console.error("delete_scenepack_clip_files failed:", err);
  }
}
