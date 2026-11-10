import type { EpisodeEntry } from "../../types/domain";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import { scoutListVideos } from "./api";

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

  const { databases, displayNames } = useSceneScoutStore.getState();
  const customPath = useGeneralSettingsStore.getState().episodesPath;
  // read fresh, since episodes may have been indexed since the panel last listed them
  const perDatabase = await Promise.all(
    databases.map(async (db) => {
      const videos = await scoutListVideos(db.path, customPath).catch(() => []);
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
    })
  );
  return perDatabase.flat();
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
