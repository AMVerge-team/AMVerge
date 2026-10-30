import { invoke } from "@tauri-apps/api/core";
import type { SceneRange } from "./precutEpisodes";

import type {
  FlowSource,
  ScoutDatabase,
  ScoutHit,
  ScoutSearchSettings,
  ScoutStatus,
  ScoutVideo,
} from "./types";

// thin wrappers over the rust commands; `customPath` is passed per call since storage can move while the page is open

export function scoutListDatabases(customPath: string | null): Promise<ScoutDatabase[]> {
  return invoke<ScoutDatabase[]>("scout_list_databases", { customPath });
}

export function scoutDatabaseInfo(
  path: string,
  customPath: string | null
): Promise<ScoutDatabase> {
  return invoke<ScoutDatabase>("scout_database_info", { path, customPath });
}

export function scoutCreateDatabase(
  name: string,
  customPath: string | null
): Promise<ScoutDatabase> {
  return invoke<ScoutDatabase>("scout_create_database", { name, customPath });
}

export function scoutDeleteDatabase(name: string, customPath: string | null): Promise<boolean> {
  return invoke<boolean>("scout_delete_database", { name, customPath });
}

export function scoutListVideos(
  database: string,
  customPath: string | null
): Promise<ScoutVideo[]> {
  return invoke<ScoutVideo[]>("scout_list_videos", { database, customPath });
}

export function scoutDeleteVideo(
  database: string,
  videoId: number,
  customPath: string | null
): Promise<boolean> {
  return invoke<boolean>("scout_delete_video", { database, videoId, customPath });
}

export function scoutStatus(customPath: string | null): Promise<ScoutStatus> {
  return invoke<ScoutStatus>("scout_status", { customPath });
}

export function scoutSearch(
  query: string,
  settings: ScoutSearchSettings,
  customPath: string | null,
  flowFrom: FlowSource | null = null
): Promise<ScoutHit[]> {
  return invoke<ScoutHit[]>("scout_search", {
    args: {
      query,
      databases: settings.selectedDatabases,
      videos: settings.selectedVideos,
      topK: settings.topK,
      threshold: settings.threshold,
      includeThumbnails: settings.includeThumbnails,
      // always the warm daemon with idle gpu offload; a cold process per search is just slower
      keepModelInMemory: true,
      gpuStandby: true,
      flowFrom: flowFrom
        ? { path: flowFrom.path, startMs: flowFrom.startMs, endMs: flowFrom.endMs }
        : null,
    },
    customPath,
  });
}

/** `scenes` (an episode already cut on home) skips detection and indexes exactly those ranges */
export function scoutAddVideo(
  database: string,
  videoPath: string,
  detector: string,
  customPath: string | null,
  scenes: SceneRange[] | null = null
): Promise<number> {
  return invoke<number>("scout_add_video", {
    database,
    videoPath,
    detector,
    customPath,
    keepModelInMemory: true,
    gpuStandby: true,
    scenes,
  });
}

export function scoutUnloadModel(customPath: string | null): Promise<boolean> {
  return invoke<boolean>("scout_unload_model", { customPath });
}

export function scoutOpenDatabase(
  path: string,
  customPath: string | null
): Promise<ScoutDatabase> {
  return invoke<ScoutDatabase>("scout_open_database", { path, customPath });
}

/** what an aborted add-episode or thumbnail run rejects with (rust `SCOUT_CANCELED`) */
export const SCOUT_CANCELED = "Canceled.";

export function isScoutCanceled(err: unknown): boolean {
  return String(err) === SCOUT_CANCELED;
}

/** fills missing thumbnails and redoes low-resolution ones; `reportProgress` streams
 *  `scout_progress` events and makes the run abortable (the silent backfill passes false) */
export function scoutGenerateThumbnails(
  database: string,
  customPath: string | null,
  reportProgress = false
): Promise<{ done: boolean; generated: number; database: string }> {
  return invoke<{ done: boolean; generated: number; database: string }>(
    "scout_generate_thumbnails",
    { database, customPath, reportProgress }
  );
}

