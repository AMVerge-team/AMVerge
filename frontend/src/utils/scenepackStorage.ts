import { invoke } from "@tauri-apps/api/core";
import { useScenepacksStore } from "../stores/scenepackStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";

/**
 * wipes all Scenepack UI state and asks the backend to delete every
 * materialized clip on disk. used by the General Settings "Clear Scenepack
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
 * remove clips from the opened Scenepack and delete their materialized files
 *
 * `indexes` are positions in the pack's clip array. they are dropped in a
 * single pass, because splicing one at a time would shift every later index.
 * legacy entries with no clipPath never had a file of their own, so only real
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

/**
 * opens a Scenepack's own storage folder in the system file manager
 *
 * the path is taken from a clip the pack already holds rather than rebuilt from
 * the settings: every materialized clip lives directly in
 * `<storage root>/scene_packs/<pack id>/`, so its parent directory IS the pack
 * folder, whatever storage root is configured. an empty pack has no folder on
 * disk yet; nothing is created just to look at it.
 */
export async function revealScenepackStorage(pack: {
  clips: { clipPath?: string; thumbnail?: string }[];
}): Promise<void> {
  const sample = pack.clips.find((c) => c.clipPath)?.clipPath
    ?? pack.clips.find((c) => c.thumbnail)?.thumbnail;
  if (!sample) return;

  const parts = sample.replace(/\\/g, "/").split("/");
  parts.pop();
  const dir = parts.join("/");
  if (!dir) return;

  try {
    await invoke("reveal_in_file_manager", { filePath: dir });
  } catch (err) {
    console.error("Could not reveal Scenepack folder:", err);
  }
}
