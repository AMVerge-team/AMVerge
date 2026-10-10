import type { ClipItem } from "../../types/domain";
import type { ScoutHit } from "./types";
import { generateScoutPlaceholderSvg } from "./scoutPlaceholder";
import { formatClipTimeframe } from "../../components/clipsGrid/clipFormat";

export function hitToClipItem(hit: ScoutHit, index: number): ClipItem {
  const timeframe = formatClipTimeframe(hit.startSec, hit.endSec) ?? "";
  const name = fileName(hit.videoPath);
  return {
    id: `scout_${hit.database}_${hitKey(hit)}`,
    src: hit.videoPath,
    thumbnail: hit.thumbnailB64
      ? `data:image/jpeg;base64,${hit.thumbnailB64}`
      : generateScoutPlaceholderSvg(name, timeframe),
    thumbnailReady: true,
    originalPath: hit.videoPath,
    originalName: name,
    sceneIndex: index,
    startSec: hit.startSec,
    endSec: hit.endSec,
    score: hit.score,
    database: hit.database,
    sourceKind: "video",
    episodeId: scoutCacheId(hit.database),
    scoutNeedsThumb: !hit.thumbnailB64,
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
