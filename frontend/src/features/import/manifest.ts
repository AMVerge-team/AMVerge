import { ClipItem } from "../../types/domain";
import { fileNameFromPath } from "../../utils/episodeUtils";

// builds grid clips from a manifest, preferring the initialClips the backend
// streams and falling back to raw scene ranges over the source video
export function parseManifestInitialClips(manifest: any, episodeId: string): ClipItem[] {
  const raw = Array.isArray(manifest?.initialClips) ? manifest.initialClips : [];

  const clipsFromInitial: ClipItem[] = raw.map((s: any, index: number) => ({
    id: `${episodeId}_${typeof s?.scene_index === "number" ? s.scene_index : index}`,
    src: s.path,
    thumbnail: s.thumbnail,
    thumbnailReady: s.thumbnail_ready !== false,
    originalName: s.original_file,
    originalPath: s.original_path,
    sceneIndex: typeof s.scene_index === "number" ? s.scene_index : undefined,
    startSec: typeof s.start_sec === "number" ? s.start_sec : undefined,
    endSec: typeof s.end_sec === "number" ? s.end_sec : undefined,
    clipPath: typeof s.clip_path === "string" ? s.clip_path : undefined,
    clipMode: typeof s.clip_mode === "string" && s.clip_mode ? s.clip_mode : undefined,
  }));

  if (clipsFromInitial.length > 0) return clipsFromInitial;

  const sourceVideoPath =
    typeof manifest?.source?.videoPath === "string" ? manifest.source.videoPath : null;
  const sourceVideoName = sourceVideoPath ? fileNameFromPath(sourceVideoPath) : undefined;
  const scenes = Array.isArray(manifest?.scenes) ? manifest.scenes : [];

  return scenes.map((scene: any, index: number) => {
    const sceneIndex = typeof scene?.scene_index === "number" ? scene.scene_index : index;
    return {
      id: `${episodeId}_${sceneIndex}`,
      src: sourceVideoPath || "",
      thumbnail: sourceVideoPath || "",
      originalName: sourceVideoName,
      originalPath: sourceVideoPath || undefined,
      sceneIndex,
      startSec: typeof scene?.start_sec === "number" ? scene.start_sec : undefined,
      endSec: typeof scene?.end_sec === "number" ? scene.end_sec : undefined,
    };
  });
}

export function buildEpisodeCacheId(file: string): string {
  const stem = fileNameFromPath(file).replace(/\.[^./\\]+$/, "");
  const sanitized = stem
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  const shortSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${sanitized.length > 0 ? sanitized : "episode"}_${shortSuffix}`;
}

export function logImportError(phase: string, error: unknown, context?: Record<string, unknown>) {
  console.error("[import] failure", {
    phase,
    context: context ?? {},
    message: error instanceof Error ? error.message : String(error),
    error,
  });
}
