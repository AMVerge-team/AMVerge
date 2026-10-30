import { useScenepacksStore } from "../stores/scenepackStore";
import { useScenepackPendingStore } from "../stores/scenepackPendingStore";
import { materializeClipsForScenepack } from "./scenepackMaterialize";
import type { ClipItem } from "../types/domain";

/** adds clips to a pack in the background: placeholders show at once, and a clip persists only once its file exists */
export function addClipsToScenepack(
  clips: ClipItem[],
  scenepackId: string,
  episodeId: string | null
): void {
  if (clips.length === 0) return;

  const pendingStore = useScenepackPendingStore.getState();
  const entries = clips.map((clip) => ({
    key: `${scenepackId}:${clip.id}:${crypto.randomUUID()}`,
    scenepackId,
    source: clip,
    error: null,
  }));
  const keys = entries.map((e) => e.key);
  pendingStore.addPending(entries);

  void (async () => {
    try {
      const { clips: materialized, failedCount } = await materializeClipsForScenepack(
        clips,
        scenepackId,
        episodeId
      );

      if (materialized.length === 0) {
        useScenepackPendingStore
          .getState()
          .failPending(keys, failedCount > 0 ? "Could not cut this clip." : "Nothing to add.");
        return;
      }

      const addClip = useScenepacksStore.getState().addClipToScenepack;
      for (const clip of materialized) addClip(scenepackId, clip);

      // only returned clips resolve; the rest keep their placeholder and reason
      const resolvedKeys = keys.slice(0, materialized.length);
      useScenepackPendingStore.getState().resolvePending(resolvedKeys);
      if (failedCount > 0) {
        useScenepackPendingStore
          .getState()
          .failPending(keys.slice(materialized.length), "Could not cut this clip.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to add clips to Scenepack:", err);
      useScenepackPendingStore.getState().failPending(keys, message);
    }
  })();
}
