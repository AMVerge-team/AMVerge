// wire types mirroring `src-tauri/src/commands/scene_scout/types.rs` and the cli's json; all three move together

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

/** subject direction on screen (+y down), or still / unclear */
export type MotionSubject =
  | "right" | "down-right" | "down" | "down-left" | "left" | "up-left" | "up" | "up-right"
  | "still" | "unclear";

/** how one end of a scene moves; derived by the CLI from measured optical flow */
export type MotionTags = {
  subject: MotionSubject;
  /** pan-<direction>, zoom-in, zoom-out, static or unclear */
  camera: string;
  /** subject speed when it moves */
  speed: "slow" | "medium" | "fast" | null;
};

export type SceneMotion = { start: MotionTags; end: MotionTags };

/** The clip a flow search continues: a whole file, or a range inside one. */
export type FlowSource = {
  path: string;
  startMs?: number;
  endMs?: number;
  /** what the chip calls it */
  label: string;
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
  /** null for scenes indexed without motion */
  motion?: SceneMotion | null;
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

/** what the search settings dropdown controls, persisted like every other preference */
export type ScoutSearchSettings = {
  /** how many results a search returns */
  topK: number;
  /** always true. every result tile needs its still, and there is nothing else
   *  to show in its place, so this is not exposed as a user setting */
  includeThumbnails: boolean;
  /** empty means every database. only offered once there is more than one */
  selectedDatabases: string[];
  /** empty means all videos in selected databases */
  selectedVideos: string[];
  /** scene detection last picked when indexing, preselected next time */
  lastIndexDetection?: "transnetv2_gpu" | "keyframe_detection";
};

export const DEFAULT_SEARCH_SETTINGS: ScoutSearchSettings = {
  topK: 24,
  includeThumbnails: true,
  selectedDatabases: [],
  selectedVideos: [],
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
