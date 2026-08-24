import { useScenepacksStore } from "../stores/scenepackStore";
import { useScenepackPendingStore } from "../stores/scenepackPendingStore";
import { materializeClipsForScenepack } from "./scenepackMaterialize";
import type { ClipItem } from "../types/domain";

/**
 * Adds clips to a Scenepack without making the user wait for it.
 *
 * Cutting a clip is not cheap: the CLI is a separate process, and for a
 * WebP-mode episode it indexes the source's keyframes before it can cut
 * anything. Blocking the UI on that turned a one-second gesture into a
 * multi-second one, repeated for every clip of a pass.
 *
 * So the work is started and the caller is released. The clips show up in the
 * grid immediately as placeholders (see `scenepackPendingStore`) and are
 * swapped for the real materialized entries when the CLI comes back. What gets
 * persisted is unchanged: a clip enters the pack only once its own copy exists
 * on disk.
 */
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

      // Only the clips that came back are resolved. Anything the CLI could not
      // produce keeps its placeholder and its reason, rather than vanishing as
      // though it had been added.
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
