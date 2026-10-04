import { invoke } from "@tauri-apps/api/core";

import type {
  ScoutDatabase,
  ScoutHit,
  ScoutSearchSettings,
  ScoutStatus,
  ScoutVideo,
} from "./types";

/**
 * Thin wrappers over the Rust commands, matching `utils/eventsApi.ts`.
 *
 * `customPath` is the storage location from Settings. It is threaded through
 * every call rather than read once, because the user can change it while the
 * page is open and the next call has to land in the new location.
 */

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

export function scoutStatus(customPath: string | null): Promise<ScoutStatus> {
  return invoke<ScoutStatus>("scout_status", { customPath });
}

export function scoutSearch(
  query: string,
  settings: ScoutSearchSettings,
  customPath: string | null
): Promise<ScoutHit[]> {
  return invoke<ScoutHit[]>("scout_search", {
    args: {
      query,
      databases: settings.selectedDatabases,
      videos: settings.selectedVideos,
      topK: settings.topK,
      threshold: settings.threshold,
      includeThumbnails: settings.includeThumbnails,
      keepModelInMemory: settings.keepModelInMemory ?? true,
      gpuStandby: settings.gpuStandby ?? true,
    },
    customPath,
  });
}

export function scoutAddVideo(
  database: string,
  videoPath: string,
  detector: string,
  customPath: string | null,
  keepModelInMemory: boolean = true,
  gpuStandby: boolean = true
): Promise<number> {
  return invoke<number>("scout_add_video", {
    database,
    videoPath,
    detector,
    customPath,
    keepModelInMemory,
    gpuStandby,
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

export function scoutGenerateThumbnails(
  database: string,
  customPath: string | null
): Promise<{ done: boolean; generated: number; database: string }> {
  return invoke<{ done: boolean; generated: number; database: string }>(
    "scout_generate_thumbnails",
    { database, customPath }
  );
}

