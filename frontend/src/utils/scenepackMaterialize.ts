import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGeneralSettingsStore } from "../stores/settingsStore";
import type { ClipItem, ScenepackClip } from "../types/domain";

type MaterializedClip = {
  index: number;
  clipPath: string | null;
  thumbnailPath: string | null;
  error: string | null;
};

export type MaterializeResult = {
  clips: ScenepackClip[];
  failedCount: number;
};

/** cuts or copies clips into the pack's own folder, so the pack survives its episodes and renders like video mode */
export async function materializeClipsForScenepack(
  sourceClips: ClipItem[],
  scenepackId: string,
  fallbackEpisodeId: string | null,
  onProgress?: (percent: number, message: string) => void
): Promise<MaterializeResult> {
  const specs = sourceClips.map((clip) =>
    clip.clipPath
      ? { existing_clip_path: clip.clipPath, existing_thumbnail_path: clip.thumbnail }
      : {
          source_path: clip.originalPath || clip.src,
          start_sec: clip.startSec,
          end_sec: clip.endSec,
        }
  );

  const customPath = useGeneralSettingsStore.getState().episodesPath;

  const unlisten = onProgress
    ? await listen<{ percent: number; message: string }>("scene_progress", (event) => {
        onProgress(event.payload.percent, event.payload.message);
      })
    : null;

  let results: MaterializedClip[];
  try {
    results = await invoke<MaterializedClip[]>("materialize_scenepack_clips", {
      clips: specs,
      scenepackId,
      customPath,
    });
  } finally {
    unlisten?.();
  }

  const byIndex = new Map(results.map((r) => [r.index, r]));
  const clips: ScenepackClip[] = [];
  let failedCount = 0;

  sourceClips.forEach((clip, i) => {
    const result = byIndex.get(i);
    if (!result || result.error || !result.clipPath) {
      console.error("Failed to add clip to Scenepack:", result?.error ?? "no result returned");
      failedCount += 1;
      return;
    }
    clips.push({
      episodeId: clip.episodeId ?? fallbackEpisodeId ?? "",
      sceneIndex: clip.sceneIndex ?? 0,
      input: clip.src,
      originalPath: clip.originalPath,
      startSec: clip.startSec,
      endSec: clip.endSec,
      clipPath: result.clipPath,
      thumbnail: result.thumbnailPath ?? clip.thumbnail,
      // the original mode, before every clip gets its own clipPath
      sourceKind: clip.clipPath ? "video" : "webp",
    });
  });

  return { clips, failedCount };
}
