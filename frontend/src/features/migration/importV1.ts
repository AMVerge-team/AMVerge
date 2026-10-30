import { invoke } from "@tauri-apps/api/core";
import type { ClipItem, EpisodeEntry } from "../../types/domain";
import { remapClipPaths, remapPathRoot } from "../../utils/episodeUtils";
import { useGeneralSettingsStore, useThemeSettingsStore } from "../../stores/settingsStore";
import { useUIStateStore } from "../../stores/UIStore";
import { useAppPersistedStore } from "../../stores/appStore";
import { useEpisodePanelMetadataStore, useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { FEATURES } from "../featureToggles";

type V1Source = {
  v1DataDir: string;
  v2DataDir: string;
  oldEpisodesDir: string;
  newEpisodesDir: string;
  migration: V1Migration | null;
  /** with no export, V1's episodes rebuilt from their folders */
  recovered: RecoveredEpisode[];
};

type RecoveredEpisode = {
  id: string;
  name: string;
  importedAt: number;
  clips: { src: string; thumbnail: string }[];
};

/** what V1 1.3.3 writes to `v2-migration.json` right before installing V2 */
type V1Migration = {
  version: number;
  localStorage: Record<string, string | null>;
  /** the zustand payload V1 kept in IndexedDB: `{ state: { episodes }, version }` */
  episodePanel: string | null;
};

/** V1 clips named their range `start`/`end`, and `endSec` could be null */
type V1Clip = Omit<ClipItem, "endSec"> & { endSec?: number | null; start?: number; end?: number };
type V1Episode = Omit<EpisodeEntry, "clips"> & { clips: V1Clip[] };

export type V1ImportSummary = { episodes: number; settings: boolean };

/** set when this launch imported from V1, so App can say so once */
export let v1ImportSummary: V1ImportSummary | null = null;

// V1 and V2 share these key names, so V2's own persist merge/migrate reads V1's values
const SETTINGS_KEYS = [
  "amverge.generalSettings.v2",
  "amverge.theme.v2",
  "amverge.ui.v1",
  "amverge_export_dir_v1",
  "amverge_episode_panel_metadata_v1",
  "amverge.featuredProfileIcons",
];

/** runs once, before the first render, on the first launch after AMVerge 1 */
export async function importFromV1(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const source = await invoke<V1Source | null>("v1_migration_source");
  if (!source) return;

  // only into a fresh V2; an install that already has settings keeps its own
  const freshV2 = localStorage.getItem("amverge.generalSettings.v2") === null;
  const migration = freshV2 ? source.migration : null;

  if (migration) await importSettings(migration, source);
  const episodes = migration
    ? v1Episodes(migration, source)
    : freshV2 && !source.migration
      ? recoveredEpisodes(source)
      : [];

  const { moved } = await invoke<{ moved: string[] }>("import_v1_files", {
    oldEpisodesDir: source.oldEpisodesDir,
    newEpisodesDir: source.newEpisodesDir,
    episodes: episodes.map((episode) => ({ id: episode.id, manifest: manifestFor(episode) })),
  });

  const movedIds = new Set(moved);
  const imported = episodes.filter((episode) => movedIds.has(episode.id));
  if (imported.length) useEpisodePanelRuntimeStore.getState().setEpisodes(imported);

  if (migration || imported.length) v1ImportSummary = { episodes: imported.length, settings: !!migration };
  console.log(`[migration] imported ${imported.length} episode(s) from AMVerge 1`);
}

async function importSettings(migration: V1Migration, source: V1Source) {
  // backgrounds and profile icons are copied into V2's app data, so paths to them move too
  const assetRoots = ["backgrounds", "profile_icons"].map((dir) => [
    `${source.v1DataDir}/${dir}`,
    `${source.v2DataDir}/${dir}`,
  ]);
  for (const key of SETTINGS_KEYS) {
    const raw = migration.localStorage[key];
    if (typeof raw !== "string") continue;
    try {
      localStorage.setItem(key, JSON.stringify(remapStrings(JSON.parse(raw), assetRoots)));
    } catch {
      localStorage.setItem(key, raw);
    }
  }

  await Promise.all([
    useGeneralSettingsStore.persist.rehydrate(),
    useThemeSettingsStore.persist.rehydrate(),
    useUIStateStore.persist.rehydrate(),
    useAppPersistedStore.persist.rehydrate(),
    useEpisodePanelMetadataStore.persist.rehydrate(),
  ]);

  // V1 settings predate the feature switches, which the merge would read as all on; V2 starts them off
  useGeneralSettingsStore.setState(
    Object.fromEntries(FEATURES.map((feature) => [feature.setting, false])),
  );
}

/** V1 clips are files it cut; V2 plays those as `clipPath` in a video-mode episode */
function v1Episodes(migration: V1Migration, source: V1Source): EpisodeEntry[] {
  let episodes: unknown;
  try {
    episodes = JSON.parse(migration.episodePanel ?? "null")?.state?.episodes;
  } catch {
    return [];
  }
  if (!Array.isArray(episodes)) return [];

  return episodes.map((episode: V1Episode) => ({
    ...episode,
    importMethod: "video_files",
    clips: episode.clips.map(({ start, end, ...clip }, index) =>
      remapClipPaths(
        {
          ...clip,
          sceneIndex: clip.sceneIndex ?? index,
          startSec: clip.startSec ?? start,
          endSec: clip.endSec ?? end ?? undefined,
          originalPath: clip.originalPath ?? episode.videoPath,
          clipPath: clip.src,
          thumbnailReady: true,
          episodeId: episode.id,
          sourceKind: "video",
        } satisfies ClipItem,
        `${source.oldEpisodesDir}/${episode.id}`,
        `${source.newEpisodesDir}/${episode.id}`,
      ),
    ),
  }));
}

/** users who skipped 1.3.3: no scene times or source video, but the cut clips still play and export */
function recoveredEpisodes(source: V1Source): EpisodeEntry[] {
  return source.recovered.map((episode) => ({
    id: episode.id,
    displayName: episode.name,
    videoPath: "",
    folderId: null,
    importedAt: episode.importedAt,
    importMethod: "video_files",
    clips: episode.clips.map((clip, index) =>
      remapClipPaths(
        {
          id: crypto.randomUUID(),
          src: clip.src,
          thumbnail: clip.thumbnail,
          originalName: episode.name,
          sceneIndex: index,
          clipPath: clip.src,
          thumbnailReady: true,
          episodeId: episode.id,
          sourceKind: "video",
        } satisfies ClipItem,
        `${source.oldEpisodesDir}/${episode.id}`,
        `${source.newEpisodesDir}/${episode.id}`,
      ),
    ),
  }));
}

/** the V2 manifest shape `parseManifestInitialClips` reads */
function manifestFor(episode: EpisodeEntry) {
  return {
    importedFromV1: true,
    importMethod: "video_files",
    source: { videoPath: episode.videoPath },
    initialClips: episode.clips.map((clip, index) => ({
      scene_index: clip.sceneIndex ?? index,
      path: clip.src,
      thumbnail: clip.thumbnail,
      thumbnail_ready: true,
      original_file: clip.originalName,
      original_path: clip.originalPath,
      start_sec: clip.startSec,
      end_sec: clip.endSec,
      clip_path: clip.clipPath,
      clip_mode: "copy",
    })),
  };
}

function remapStrings(value: unknown, roots: string[][]): unknown {
  if (typeof value === "string") {
    return roots.reduce((path, [from, to]) => remapPathRoot(path, from, to), value);
  }
  if (Array.isArray(value)) return value.map((item) => remapStrings(item, roots));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapStrings(v, roots)]));
  }
  return value;
}
