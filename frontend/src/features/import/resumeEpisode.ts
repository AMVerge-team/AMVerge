import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipItem, EpisodeEntry } from "../../types/domain";
import { useAppStateStore } from "../../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { createClipPatchBuffer } from "./clipPatchBuffer";

// paused video-mode episodes (unfinished clips, derived, never stored) and finishing them via resume_episode_clips

function isUnfinished(clip: ClipItem): boolean {
  if (clip.mergedSrcs?.length) return false;
  if (clip.clipMode === "failed") return false;
  return !clip.clipPath || clip.thumbnailReady === false;
}

export function isEpisodePaused(
  episode: EpisodeEntry,
  liveImportEpisodeIds: string[],
  reencodeQueue: string[]
): boolean {
  if (episode.importMethod !== "video_files") return false;
  if (reencodeQueue.includes(episode.id) || liveImportEpisodeIds.includes(episode.id)) return false;
  return episode.clips.some(isUnfinished);
}

// the unfinished scenes in the shape `resume_episode_clips` takes
function buildResumeSpecs(episode: EpisodeEntry) {
  return episode.clips
    .filter(isUnfinished)
    .filter((c) => typeof c.sceneIndex === "number" && typeof c.startSec === "number" && typeof c.endSec === "number")
    .map((c) => ({
      scene_index: c.sceneIndex,
      source_path: c.originalPath || episode.videoPath,
      start_sec: c.startSec,
      end_sec: c.endSec,
      clip_path: c.clipPath ?? null,
      clip_mode: c.clipMode ?? null,
      thumbnail: c.thumbnail,
    }));
}

/** whether the episode still has clips a resume can finish */
export function hasClipsToFinish(episodeId: string): boolean {
  const episode = useEpisodePanelRuntimeStore.getState().episodes.find((e) => e.id === episodeId);
  return Boolean(episode && buildResumeSpecs(episode).length > 0);
}

/** cuts the episode's unfinished clips; only the re-encode queue calls this, so one runs at a time */
export async function finishEpisodeClips(episodeId: string): Promise<void> {
  const episode = useEpisodePanelRuntimeStore.getState().episodes.find((e) => e.id === episodeId);
  if (!episode) return;
  const specs = buildResumeSpecs(episode);
  if (specs.length === 0) return;

  const total = episode.clips.length;
  let done = total - specs.length;
  const label = `Finishing clips for ${episode.displayName}`;
  // a running import owns the mini window's main bar, so this reports on the bar under it
  const progressUpdate = () => ({
    reencodeProgress: { done, total },
    ...(useAppStateStore.getState().activeOperation !== "import"
      ? { progress: Math.round((done / total) * 100), progressMsg: label }
      : {}),
  });
  useAppStateStore.setState({ resumingEpisodeId: episodeId, ...progressUpdate() });

  console.info("[resume] finishing episode clips", { episodeId, clips: specs.length });

  // buffered per frame like a live import, so a burst of events is one grid update
  const patches = createClipPatchBuffer((apply) => {
    useEpisodePanelRuntimeStore.getState().setEpisodes((prev) =>
      prev.map((ep) => (ep.id === episodeId ? { ...ep, clips: ep.clips.map(apply) } : ep))
    );
    const onScreen = useEpisodePanelRuntimeStore.getState().openedEpisodeId === episodeId;
    useAppStateStore.setState((s) => ({
      ...(onScreen ? { clips: s.clips.map(apply) } : {}),
      ...progressUpdate(),
    }));
  });
  const patch = (sceneIndex: number, p: Partial<ClipItem>) => patches.patch(`${episodeId}_${sceneIndex}`, p);

  const isMine = (p: { episode_cache_id?: string | null }) => p.episode_cache_id === episodeId;
  const unlistenClip = await listen<{
    scene_index: number;
    clip_path: string | null;
    clip_mode: string;
    episode_cache_id?: string | null;
  }>("clip_ready", (e) => {
    if (!isMine(e.payload)) return;
    done = Math.min(total, done + 1);
    patch(e.payload.scene_index, {
      clipPath: e.payload.clip_path ?? undefined,
      clipMode: e.payload.clip_mode || undefined,
    });
  });
  const unlistenThumb = await listen<{ position: number; episode_cache_id?: string | null }>(
    "thumbnail_ready",
    (e) => {
      if (!isMine(e.payload)) return;
      patch(e.payload.position, { thumbnailReady: true });
    }
  );

  try {
    await invoke("resume_episode_clips", { episodeCacheId: episodeId, clips: specs });
  } catch (err) {
    console.error("[resume] failed:", err);
  } finally {
    patches.flushNow();
    unlistenClip();
    unlistenThumb();
    useAppStateStore.setState({ resumingEpisodeId: null, reencodeProgress: null });
  }
}
