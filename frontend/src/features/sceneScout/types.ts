/**
 * Scene Scout wire types.
 *
 * These mirror `frontend/src-tauri/src/commands/scene_scout.rs`, which in turn
 * mirrors the CLI's JSON. All three have to move together.
 */

/** A search database on disk, and what it holds. */
export type ScoutDatabase = {
  name: string;
  path: string;
  videoCount: number;
  sceneCount: number;
  sizeBytes: number;
  modelVersion: string;
  createdAt: string | null;
};

/** A video indexed into a database. */
export type ScoutVideo = {
  id: number;
  filepath: string;
  name: string;
  sceneCount: number;
  /** "indexing" until the run finishes, so a partial row is visibly partial */
  status: string;
  modifiedAt: number;
};

/** One search result: a time range inside an indexed video. */
export type ScoutHit = {
  videoPath: string;
  sceneIndex: number;
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
  /** cosine similarity, 0..1 */
  score: number;
  database: string;
  /** base64 JPEG, absent when thumbnails were turned off in search settings */
  thumbnailB64: string | null;
};

export type ScoutStatus = {
  modelAvailable: boolean;
  modelVersion: string;
  device: string | null;
  root: string;
  databaseCount: number;
};

/** Progress from an indexing run, streamed on the `scout_progress` event. */
export type ScoutIndexProgress = {
  stage: string;
  done: number;
  total: number;
  video: string | null;
};

/**
 * What the search settings dropdown controls.
 *
 * Persisted with the rest of the app's settings, so a user's tuning survives a
 * restart the way every other preference does.
 */
export type ScoutSearchSettings = {
  /** how many results a search returns */
  topK: number;
  /** minimum score to include; -1 shows everything the model matched */
  threshold: number;
  /** always true. every result tile needs its still, and there is nothing else
   *  to show in its place, so this is not exposed as a user setting */
  includeThumbnails: boolean;
  /** empty means every database. only offered once there is more than one */
  selectedDatabases: string[];
  /** empty means all videos in selected databases */
  selectedVideos: string[];
  /** keep model weights in memory across searches for instant responses */
  keepModelInMemory?: boolean;
  /** offload model from GPU to CPU after idle periods to save VRAM */
  gpuStandby?: boolean;
};

export const DEFAULT_SEARCH_SETTINGS: ScoutSearchSettings = {
  topK: 24,
  threshold: -1,
  includeThumbnails: true,
  selectedDatabases: [],
  selectedVideos: [],
  keepModelInMemory: true,
  gpuStandby: true,
};

/** Sentinel for the Custom entry. Zero is never a real result count, so it can
 *  stand for "the number is in the box beside this" without a second field. */
export const CUSTOM_TOP_K = 0;

export const MIN_TOP_K = 1;
export const MAX_TOP_K = 500;

/** Options offered in the settings dropdown, shaped for the shared `Dropdown`. */
export const TOP_K_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: 12, label: "Top 12", description: "Quick look" },
  { value: 24, label: "Top 24", description: "Default" },
  { value: 48, label: "Top 48", description: "Wider net" },
  { value: 96, label: "Top 96", description: "Broad, slower" },
  { value: 200, label: "Top 200", description: "Slowest" },
  { value: CUSTOM_TOP_K, label: "Custom", description: "Type your own" },
];

/** True when `topK` is not one of the presets, so the Custom box owns it. */
export function isCustomTopK(topK: number): boolean {
  return !TOP_K_OPTIONS.some((o) => o.value !== CUSTOM_TOP_K && o.value === topK);
}

export const THRESHOLD_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: -1, label: "Show everything", description: "No cutoff, ranked best first" },
  { value: 0.1, label: "Loose", description: "Drops clearly unrelated" },
  { value: 0.2, label: "Balanced", description: "Trims weak matches" },
  { value: 0.3, label: "Strict", description: "Only confident matches" },
];
