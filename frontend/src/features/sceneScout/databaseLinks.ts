import type { EpisodeEntry } from "../../types/domain";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import { scoutListVideos, scoutListVideosBatch } from "./api";
import type { ScoutVideo } from "./types";

/** one library episode's video indexed in one scene scout database */
export type DatabaseLink = {
  episodeName: string;
  videoPath: string;
  databasePath: string;
  databaseName: string;
  videoId: number;
};

/** the databases that index these episodes' videos; a video another kept episode still uses is left out */
export async function findDatabaseLinks(episodeIds: string[]): Promise<DatabaseLink[]> {
  const episodes = useEpisodePanelRuntimeStore.getState().episodes;
  const deleting = episodes.filter((e) => episodeIds.includes(e.id) && e.videoPath);
  const kept = episodes.filter((e) => !episodeIds.includes(e.id));
  const targets = deleting.filter((e) => !kept.some((k) => samePath(k.videoPath, e.videoPath)));
  if (targets.length === 0) return [];

  const { databases, displayNames, videosByDatabase } = useSceneScoutStore.getState();
  const nonEmptyDbs = databases.filter((db) => db.videoCount !== 0);
  if (nonEmptyDbs.length === 0) return [];

  const customPath = useGeneralSettingsStore.getState().episodesPath;
  const resolvedVideos: Record<string, ScoutVideo[]> = {};
  const missingPaths: string[] = [];

  for (const db of nonEmptyDbs) {
    const cached = videosByDatabase[db.path];
    if (cached && cached.length === db.videoCount) {
      resolvedVideos[db.path] = cached;
    } else {
      missingPaths.push(db.path);
    }
  }

  if (missingPaths.length > 0) {
    try {
      const batch = await scoutListVideosBatch(missingPaths, customPath);
      for (const path of missingPaths) {
        resolvedVideos[path] = batch[path] ?? [];
      }
      useSceneScoutStore.setState((state) => ({
        videosByDatabase: { ...state.videosByDatabase, ...resolvedVideos },
      }));
    } catch {
      await Promise.all(
        missingPaths.map(async (path) => {
          resolvedVideos[path] = await scoutListVideos(path, customPath).catch(() => []);
        })
      );
      useSceneScoutStore.setState((state) => ({
        videosByDatabase: { ...state.videosByDatabase, ...resolvedVideos },
      }));
    }
  }

  return nonEmptyDbs.flatMap((db) => {
    const videos = resolvedVideos[db.path] ?? [];
    return videos.flatMap((video) => {
      const episode = targets.find((e: EpisodeEntry) => samePath(e.videoPath, video.filepath));
      return episode
        ? [{
            episodeName: episode.displayName,
            videoPath: episode.videoPath,
            databasePath: db.path,
            databaseName: displayNames[db.path] ?? db.name,
            videoId: video.id,
          }]
        : [];
    });
  });
}

/** drops each linked video from its database, one at a time */
export async function removeDatabaseLinks(links: DatabaseLink[]): Promise<void> {
  const deleteVideo = useSceneScoutStore.getState().deleteVideo;
  for (const link of links) await deleteVideo(link.databasePath, link.videoId);
}

/** "episode: database, database" lines for a confirmation list */
export function linksByEpisode(links: DatabaseLink[]): { episodeName: string; databases: string[] }[] {
  const grouped = new Map<string, { episodeName: string; databases: string[] }>();
  for (const link of links) {
    const entry = grouped.get(link.videoPath) ?? { episodeName: link.episodeName, databases: [] };
    entry.databases.push(link.databaseName);
    grouped.set(link.videoPath, entry);
  }
  return [...grouped.values()];
}
