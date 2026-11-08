import { invoke } from "@tauri-apps/api/core";
import type { ClipItem, EpisodeEntry, ScenepackClip, ScenepackEntry } from "../../types/domain";
import { useAppStateStore } from "../../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { useScenePreviewStore } from "../../stores/scenePreviewStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";

// the folders the app owns under the storage root (rust's OWNED_STORAGE_DIRS); change both together
const EPISODES_DIR = "episodes_storage";
const SCENEPACKS_DIR = "scene_packs";

const toSlashes = (p: string) => p.replace(/\\/g, "/");

/** the storage root the app writes to now: the custom folder, or app data's `episodes` */
export async function currentStorageRoot(): Promise<string> {
  const custom = useGeneralSettingsStore.getState().episodesPath?.trim();
  if (custom) return custom.replace(/[\\/]+$/, "");
  const episodesDir = await invoke<string>("get_default_episodes_dir");
  return episodesDir.replace(/[\\/]+$/, "").replace(/[\\/]episodes_storage$/i, "");
}

/**
 * points a stored path at `root`, by its place inside the storage folder rather than the old root, so a path
 * stays fixable whatever moved it: `.../episodes_storage/<rest>` or `.../scene_packs/<rest>` keep `<rest>`, and a
 * clip path that lost its `episodes_storage` part (an older move dropped it) is found by its episode folder
 */
function rebasePath(path: string, root: string, episodeFolder?: string): string {
  if (!path) return path;
  const slashed = toSlashes(path);
  const lower = slashed.toLowerCase();
  const sep = root.includes("\\") ? "\\" : "/";
  const join = (rest: string) => `${root}${sep}${rest.split("/").join(sep)}`;

  for (const dir of [EPISODES_DIR, SCENEPACKS_DIR]) {
    const at = lower.lastIndexOf(`/${dir}/`);
    if (at >= 0) {
      const next = join(slashed.slice(at + 1));
      return toSlashes(next).toLowerCase() === lower ? path : next;
    }
  }

  if (episodeFolder) {
    const at = lower.lastIndexOf(`/${episodeFolder.toLowerCase()}/`);
    if (at >= 0) return join(`${EPISODES_DIR}/${slashed.slice(at + 1)}`);
  }

  return path;
}

// source videos (originalPath, videoPath) live outside storage, so only the folder match may move them
function rebaseClip<T extends ClipItem>(clip: T, root: string, episodeFolder: string): T {
  const own = (p: string) => rebasePath(p, root, episodeFolder);
  const source = (p: string) => rebasePath(p, root);
  const next: T = {
    ...clip,
    src: own(clip.src),
    thumbnail: own(clip.thumbnail),
    srcList: clip.srcList?.map(own),
    mergedSrcs: clip.mergedSrcs?.map(own),
    clipPath: clip.clipPath ? own(clip.clipPath) : clip.clipPath,
    originalPath: clip.originalPath ? source(clip.originalPath) : clip.originalPath,
  };
  const changed =
    next.src !== clip.src ||
    next.thumbnail !== clip.thumbnail ||
    next.clipPath !== clip.clipPath ||
    next.originalPath !== clip.originalPath ||
    next.srcList?.some((p, i) => p !== clip.srcList?.[i]) ||
    next.mergedSrcs?.some((p, i) => p !== clip.mergedSrcs?.[i]);
  return changed ? next : clip;
}

function rebaseEpisode(episode: EpisodeEntry, root: string): EpisodeEntry {
  const clips = episode.clips.map((clip) => rebaseClip(clip, root, episode.id));
  const videoPath = rebasePath(episode.videoPath, root);
  const changed = videoPath !== episode.videoPath || clips.some((clip, i) => clip !== episode.clips[i]);
  return changed ? { ...episode, videoPath, clips } : episode;
}

function rebaseScenepackClip(clip: ScenepackClip, root: string): ScenepackClip {
  const next: ScenepackClip = {
    ...clip,
    input: rebasePath(clip.input, root, clip.episodeId),
    thumbnail: rebasePath(clip.thumbnail, root, clip.episodeId),
    clipPath: clip.clipPath ? rebasePath(clip.clipPath, root) : clip.clipPath,
    originalPath: clip.originalPath ? rebasePath(clip.originalPath, root) : clip.originalPath,
  };
  const changed =
    next.input !== clip.input ||
    next.thumbnail !== clip.thumbnail ||
    next.clipPath !== clip.clipPath ||
    next.originalPath !== clip.originalPath;
  return changed ? next : clip;
}

function rebaseScenepack(pack: ScenepackEntry, root: string): ScenepackEntry {
  const clips = pack.clips.map((clip) => rebaseScenepackClip(clip, root));
  const thumbnail = pack.thumbnail ? rebasePath(pack.thumbnail, root) : pack.thumbnail;
  const changed = thumbnail !== pack.thumbnail || clips.some((clip, i) => clip !== pack.clips[i]);
  return changed ? { ...pack, thumbnail, clips } : pack;
}

/** a storage move empties the grid so windows can move the files; this puts the open episode back afterwards */
export function restoreOpenedEpisodeGrid(): void {
  const { episodes, openedEpisodeId } = useEpisodePanelRuntimeStore.getState();
  const opened = openedEpisodeId ? episodes.find((episode) => episode.id === openedEpisodeId) : null;
  if (!opened) return;
  useAppStateStore.getState().setClips(opened.clips);
}

/**
 * points every stored episode, scenepack and preview path at the storage root in use; untouched entries keep
 * their objects, so an already-correct library writes nothing. returns how many episodes and packs changed
 */
export async function rebaseStoragePaths(root?: string): Promise<number> {
  const target = root ?? (await currentStorageRoot());
  let changed = 0;

  useEpisodePanelRuntimeStore.setState((s) => {
    const episodes = s.episodes.map((episode) => rebaseEpisode(episode, target));
    const count = episodes.filter((episode, i) => episode !== s.episodes[i]).length;
    changed += count;
    return count > 0 ? { episodes } : {};
  });

  useScenepacksStore.setState((s) => {
    const scenepacks = s.scenepacks.map((pack) => rebaseScenepack(pack, target));
    const count = scenepacks.filter((pack, i) => pack !== s.scenepacks[i]).length;
    changed += count;
    return count > 0 ? { scenepacks } : {};
  });

  // the open episode's grid and its webp previews hold their own copies of the paths
  const openedId = useEpisodePanelRuntimeStore.getState().openedEpisodeId;
  useAppStateStore.setState((s) => ({
    clips: s.clips.map((clip) => rebaseClip(clip, target, clip.episodeId ?? openedId ?? "")),
    importedVideoPath: s.importedVideoPath ? rebasePath(s.importedVideoPath, target) : s.importedVideoPath,
  }));
  useScenePreviewStore.setState((s) => {
    const next: Record<string, string> = {};
    for (const [clipId, path] of Object.entries(s.animatedByClipId)) next[clipId] = rebasePath(path, target);
    return { animatedByClipId: next };
  });

  if (changed > 0) {
    console.info(`[storage] pointed ${changed} episode(s)/scenepack(s) at ${target}`);
    useAppStateStore.getState().setImportToken(Date.now().toString());
  }
  return changed;
}
