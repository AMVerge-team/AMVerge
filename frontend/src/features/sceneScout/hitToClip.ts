import type { ClipItem } from "../../types/domain";
import type { ScoutHit } from "./types";

/**
 * Turn a search hit into a grid tile.
 *
 * This function is the whole reason Scene Scout gets preview-all, hover
 * playback, grid preview speed, timestamps and the download button without
 * reimplementing any of them: the results render through the same
 * `ClipsContainer` / `LazyClip` the episode grid uses, so every one of those
 * settings already applies. Scenepacks does the same thing in
 * `pages/ScenepacksPage.tsx`.
 *
 * A hit is a *time range in a source video*, not a cut file, so it maps onto the
 * same shape the WebP-mode episode grid uses: `src` is the source video and
 * `startSec`/`endSec` bound the scene. `clipPath` is deliberately left unset;
 * setting it would put the tile in video mode and send it looking for a pre-cut
 * file that Scene Scout never produced.
 */
export function hitToClipItem(hit: ScoutHit, index: number): ClipItem {
  return {
    id: `scout_${hit.database}_${hitKey(hit)}`,
    src: hit.videoPath,
    // the CLI ships the frame it embedded, so the tile has a real still without
    // the grid having to decode anything up front
    thumbnail: hit.thumbnailB64
      ? `data:image/jpeg;base64,${hit.thumbnailB64}`
      : hit.videoPath,
    thumbnailReady: true,
    originalPath: hit.videoPath,
    originalName: fileName(hit.videoPath),
    sceneIndex: index,
    startSec: hit.startSec,
    endSec: hit.endSec,
    sourceKind: "video",
    // the animated-preview cache is keyed on this. it has to be set and it has
    // to be scout-specific: left undefined, `buildWebpJob` falls back to
    // whichever episode happens to be open and writes previews into that
    // episode's cache. keying it per database also means the same scene
    // resolves to the same cached preview across searches
    episodeId: scoutCacheId(hit.database),
  };
}

/**
 * Cache id for a database's animated previews.
 *
 * Prefixed so it can never collide with a real episode cache id, which is
 * derived from a filename.
 */
export function scoutCacheId(database: string): string {
  const sanitized = database.replace(/[^A-Za-z0-9_-]+/g, "_");
  if (sanitized.length <= 60) return `scoutcache_${sanitized}`;
  let hash = 0;
  for (let i = 0; i < database.length; i++) {
    hash = ((hash << 5) - hash + database.charCodeAt(i)) | 0;
  }
  const hashHex = (hash >>> 0).toString(16);
  return `scout_${hashHex}_${sanitized.slice(-40)}`;
}

/** Stable per-hit id, so re-running the same search does not remount every tile. */
export function hitKey(hit: ScoutHit): string {
  return `${hit.videoPath}_${hit.sceneIndex}_${hit.startMs}`;
}

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
