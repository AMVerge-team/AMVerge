import type { ClipItem, EpisodeEntry, EpisodeFolder } from "../../types/domain";
import { useEpisodePanelMetadataStore, useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import type { SceneDetectionMethod } from "../../stores/settingsStore";
import { buildEpisodeCacheId } from "../import/manifest";
import { discardEpisodeCache, hasLanded, importAbortRef, runImportPipeline } from "../import/importPipeline";
import { prioritizeScenes, queueBackgroundReencode } from "../import/reencodeQueue";
import { isResumable } from "../import/resumeEpisode";
import { episodeSceneRanges, type SceneRange } from "./precutEpisodes";

// scene scout and the library share episodes: imports cut into the library, hits play its clips

const norm = (path: string) => path.replace(/\\/g, "/").toLowerCase();
const startKey = (sec: number) => Math.round(sec * 1000);

// rebuilt only when the episode list or an episode changes
const episodeIndexCache = new WeakMap<EpisodeEntry[], Map<string, EpisodeEntry>>();
const clipIndexCache = new WeakMap<EpisodeEntry, Map<number, ClipItem>>();

function episodeByVideo(episodes: EpisodeEntry[]): Map<string, EpisodeEntry> {
  let index = episodeIndexCache.get(episodes);
  if (!index) {
    index = new Map();
    // newest first, so a re-imported video matches its latest cut
    for (const episode of episodes) {
      if (episode.videoPath && !index.has(norm(episode.videoPath))) index.set(norm(episode.videoPath), episode);
    }
    episodeIndexCache.set(episodes, index);
  }
  return index;
}

function clipByStart(episode: EpisodeEntry): Map<number, ClipItem> {
  let index = clipIndexCache.get(episode);
  if (!index) {
    index = new Map();
    for (const clip of episode.clips) {
      if (clip.startSec !== undefined) index.set(startKey(clip.startSec), clip);
    }
    clipIndexCache.set(episode, index);
  }
  return index;
}

/** the library clip a scout scene was indexed from: same video, same start (scout indexes the manifest's ms) */
export function libraryClipFor(
  videoPath: string,
  startSec: number,
  episodes = useEpisodePanelRuntimeStore.getState().episodes
): { episode: EpisodeEntry; clip: ClipItem } | null {
  const episode = episodeByVideo(episodes).get(norm(videoPath));
  if (!episode) return null;
  const clips = clipByStart(episode);
  const key = startKey(startSec);
  const exact = clips.get(key) ?? clips.get(key - 1) ?? clips.get(key + 1);
  if (exact) return { episode, clip: exact };

  let nearest: ClipItem | null = null;
  let nearestDiff = Infinity;
  for (const candidate of episode.clips) {
    if (candidate.startSec === undefined) continue;
    const diff = Math.abs(candidate.startSec - startSec);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearest = candidate;
    }
  }
  const fallback = nearestDiff <= 2 ? nearest : (episode.clips[0] ?? null);
  return fallback ? { episode, clip: fallback } : null;
}

/** a scout tile plays its library clip once that is cut; anything else stays as it was */
export function linkLibraryClip(item: ClipItem, episodes?: EpisodeEntry[]): ClipItem {
  if (!item.database || item.startSec === undefined) return item;
  const match = libraryClipFor(item.src, item.startSec, episodes);
  const cut = match?.clip.clipPath && match.clip.clipMode !== "failed" ? match.clip : null;
  if (!cut || cut.clipPath === item.clipPath) return item;
  return { ...item, clipPath: cut.clipPath, clipMode: cut.clipMode };
}

/** `linkLibraryClip` over a grid, keeping the same array when nothing changed */
export function linkLibraryClips(items: ClipItem[], episodes?: EpisodeEntry[]): ClipItem[] {
  let changed = false;
  const next = items.map((item) => {
    const linked = linkLibraryClip(item, episodes);
    if (linked !== item) changed = true;
    return linked;
  });
  return changed ? next : items;
}

/** search results whose library clips are still uncut jump the re-encode queue */
export function prioritizeHits(hits: { videoPath: string; startSec: number }[]) {
  const byEpisode = new Map<string, number[]>();
  for (const hit of hits) {
    const match = libraryClipFor(hit.videoPath, hit.startSec);
    if (!match?.episode.cutsInBackground || !isResumable(match.clip)) continue;
    const scenes = byEpisode.get(match.episode.id) ?? [];
    scenes.push(match.clip.sceneIndex as number);
    byEpisode.set(match.episode.id, scenes);
  }
  prioritizeScenes(byEpisode);
}

/** the root library folder named like the database, created the first time */
function libraryFolder(name: string): string {
  const store = useEpisodePanelMetadataStore.getState();
  const existing = store.episodeFolders.find((f) => f.parentId === null && f.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const folder: EpisodeFolder = { id: crypto.randomUUID(), name, parentId: null, isExpanded: true };
  store.setEpisodeFolders((prev) => [folder, ...prev]);
  return folder.id;
}

/**
 * cuts a full episode into the library, in a folder named after the database, and returns its scenes to index.
 * only the stream-copy phase is waited on: the re-encodes go to the background queue, and searches pull hits forward.
 * a video already in the library is reused as it is.
 */
export async function cutIntoLibrary(
  videoPath: string,
  folderName: string,
  detection: SceneDetectionMethod
): Promise<SceneRange[]> {
  const existing = episodeByVideo(useEpisodePanelRuntimeStore.getState().episodes).get(norm(videoPath));
  const existingRanges = existing ? episodeSceneRanges(existing) : [];
  if (existingRanges.length > 0) return existingRanges;

  const episodeId = buildEpisodeCacheId(videoPath);
  try {
    const { episodeEntry } = await runImportPipeline(videoPath, episodeId, {
      focusGrid: false,
      folderId: libraryFolder(folderName),
      importMethod: "video_files",
      detection,
      // the ✕ during the handoff stops everything, so nothing is queued after it
      onUncut: () => {
        if (!importAbortRef.current) queueBackgroundReencode(episodeId);
      },
    });
    const entry: EpisodeEntry = { ...episodeEntry, cutsInBackground: true };
    // replaces the entry the streaming listener inserted
    useEpisodePanelRuntimeStore.getState().setEpisodes((prev) => [entry, ...prev.filter((ep) => ep.id !== episodeId)]);
    return episodeSceneRanges(entry);
  } catch (err) {
    if (!hasLanded(episodeId)) discardEpisodeCache(episodeId);
    throw err;
  }
}
