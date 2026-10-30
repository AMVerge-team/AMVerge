import type { EpisodeEntry } from "../../types/domain";

/** one scene as the cli's `--scenes-json` takes it: [start_ms, end_ms] in the original episode */
export type SceneRange = [number, number];

/** a home episode's scenes as ranges in its original video, so indexing skips detection and matches its clips */
export function episodeSceneRanges(episode: EpisodeEntry): SceneRange[] {
  const ranges: SceneRange[] = [];
  for (const clip of episode.clips) {
    if (clip.startSec === undefined || clip.endSec === undefined) continue;
    const start = Math.round(clip.startSec * 1000);
    const end = Math.round(clip.endSec * 1000);
    if (end > start) ranges.push([start, end]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/** home episodes that can be indexed without detection, newest first */
export function precutEpisodes(episodes: EpisodeEntry[]): EpisodeEntry[] {
  return episodes
    .filter((episode) => episode.videoPath && episodeSceneRanges(episode).length > 0)
    .sort((a, b) => b.importedAt - a.importedAt);
}
