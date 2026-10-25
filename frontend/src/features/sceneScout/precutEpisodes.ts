import type { EpisodeEntry } from "../../types/domain";

/** one scene as the cli's `--scenes-json` takes it: [start_ms, end_ms] in the original episode */
export type SceneRange = [number, number];

/**
 * The scenes of an episode already imported on home, as ranges in its original
 * video, read from the clips its manifest produced. Indexing these into a scene
 * scout database skips detection, and the database's scenes then match the clips
 * the user already has. Points at the original file, never the cut clips: those
 * live in the app cache, and webp-mode imports have none.
 */
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
