import { invoke } from "@tauri-apps/api/core";
import { useScenepacksStore } from "../stores/scenepackStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";

/** clears Scenepack state and deletes every materialized clip on disk */
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

/** removes clips from the opened pack in one pass (splicing shifts indexes) and deletes their files */
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

/** opens a pack's folder, the parent of any of its clips; an empty pack has no folder yet */
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
