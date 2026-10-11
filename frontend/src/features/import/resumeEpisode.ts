import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipItem, EpisodeEntry } from "../../types/domain";
import { useAppStateStore } from "../../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";

/**
 * paused video-mode episodes and their resume
 *
 * an import stops early when the CLI mini window is closed or the app is closed.
 * the episode's clips are persisted as they stream, so everything finished is
 * kept; what is left is clips with no cut or no poster. such an episode is
 * "paused" (derived from its clips, nothing extra is stored) and the sidebar
 * offers to resume it. `resume_episode_clips` reports files already on disk and
 * re-cuts the rest, streaming the same clip_ready/thumbnail_ready events a live
 * import does, while the mini window shows its progress. closing that window
 * pauses it again
 */

function isUnfinished(clip: ClipItem): boolean {
  if (clip.mergedSrcs?.length) return false;
  if (clip.clipMode === "failed") return false;
  return !clip.clipPath || clip.thumbnailReady === false;
}

export function isEpisodePaused(
  episode: EpisodeEntry,
  liveImportEpisodeIds: string[],
  resumingEpisodeId: string | null
): boolean {
  if (episode.importMethod !== "video_files") return false;
  if (resumingEpisodeId === episode.id || liveImportEpisodeIds.includes(episode.id)) return false;
  return episode.clips.some(isUnfinished);
}

// anything else running owns the mini window, and an import must not race a resume
export function canStartResume(): boolean {
  const s = useAppStateStore.getState();
  return !(s.loading || s.bgProgress || s.bgImportProgress || s.reencodeProgress || s.resumingEpisodeId);
}

export async function resumeEpisode(episodeId: string): Promise<void> {
  if (!canStartResume()) return;
  const episode = useEpisodePanelRuntimeStore.getState().episodes.find((e) => e.id === episodeId);
  if (!episode) return;

  const specs = episode.clips
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
  if (specs.length === 0) return;

  const total = episode.clips.length;
  let done = total - specs.length;
  const label = `Resuming ${episode.displayName}`;
  const app = useAppStateStore.getState();
  app.setProgress(Math.round((done / total) * 100));
  app.setProgressMsg(label);
  // bgProgress drives the mini window's bar and keeps new imports blocked meanwhile
  useAppStateStore.setState({ resumingEpisodeId: episodeId, bgProgress: { done, total } });

  console.info("[resume] resuming paused episode", { episodeId, clips: specs.length });

  // buffered per frame like a live import, so a burst of events is one grid update
  const pending = new Map<string, Partial<ClipItem>>();
  let frame: number | null = null;
  const flush = () => {
    frame = null;
    if (pending.size === 0) return;
    const snapshot = new Map(pending);
    pending.clear();
    const apply = (c: ClipItem): ClipItem => {
      const p = snapshot.get(c.id);
      return p ? { ...c, ...p } : c;
    };
    useEpisodePanelRuntimeStore.getState().setEpisodes((prev) =>
      prev.map((ep) => (ep.id === episodeId ? { ...ep, clips: ep.clips.map(apply) } : ep))
    );
    const onScreen = useEpisodePanelRuntimeStore.getState().openedEpisodeId === episodeId;
    useAppStateStore.setState((s) => ({
      ...(onScreen ? { clips: s.clips.map(apply) } : {}),
      bgProgress: s.resumingEpisodeId === episodeId ? { done, total } : s.bgProgress,
      progress: Math.round((done / total) * 100),
    }));
  };
  const patch = (sceneIndex: number, p: Partial<ClipItem>) => {
    const id = `${episodeId}_${sceneIndex}`;
    pending.set(id, { ...(pending.get(id) ?? {}), ...p });
    if (frame === null) frame = requestAnimationFrame(flush);
  };

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
    if (frame !== null) cancelAnimationFrame(frame);
    flush();
    unlistenClip();
    unlistenThumb();
    useAppStateStore.setState((s) => ({
      resumingEpisodeId: null,
      bgProgress: s.resumingEpisodeId === episodeId ? null : s.bgProgress,
    }));
  }
}
