import { listen } from "@tauri-apps/api/event";
import { ClipItem, EpisodeEntry } from "../../types/domain";
import { fileNameFromPath } from "../../utils/episodeUtils";
import { useAppStateStore } from "../../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { parseManifestInitialClips } from "./manifest";

type Deps = {
  selectedFolderId: string | null;
  importMethod: EpisodeEntry["importMethod"];
  setEpisodes: (updater: (prev: EpisodeEntry[]) => EpisodeEntry[]) => void;
  setSelectedEpisodeId: (id: string) => void;
  setOpenedEpisodeId: (id: string) => void;
};

export type StreamingSession = {
  stop: () => void;
  phase1Done: Promise<void>;
  getClips: () => ClipItem[];
};

/**
 * wires the streaming import events for one episode
 *
 * every payload carries the episode it belongs to, so several imports can be in
 * flight at once (a batch keeps re-encoding one episode while cutting the next)
 * and each session only reacts to its own events
 *
 * `focusGrid` decides whether this episode takes over the view. a batch grants
 * it to the first episode only; the rest fill their own buffer and appear in the
 * sidebar without disturbing whatever the user is browsing.
 */
export async function startVideoStreamingListeners(
  file: string,
  episodeId: string,
  focusGrid: boolean,
  deps: Deps
): Promise<StreamingSession> {
  let resolvePhase1: () => void = () => {};
  const phase1Done = new Promise<void>((resolve) => {
    resolvePhase1 = resolve;
  });

  let clipDone = 0;
  let clipTotal = 0;
  // this session's own copy of the clips. the grid store only mirrors it while
  // this episode holds focus, so a background import can never overwrite the
  // episode on screen
  let sessionClips: ClipItem[] = [];

  const isMine = (payload: { episode_cache_id?: string | null }) =>
    !payload.episode_cache_id || payload.episode_cache_id === episodeId;

  // checked live, not captured: focusGrid only says whether the import opens
  // itself, and the user can open a background episode at any point
  const isOnScreen = () =>
    useEpisodePanelRuntimeStore.getState().openedEpisodeId === episodeId;

  // clip_ready patches arrive in bursts, and applying each as its own setState
  // re-renders the whole grid every time (two O(n) store maps per event), which
  // froze the UI during import. buffer by clip id and flush once per frame
  const pendingPatches = new Map<string, Partial<ClipItem>>();
  let flushHandle: number | null = null;

  // merge rather than replace, so a clip_ready and a thumbnail_ready for the
  // same clip within one frame do not clobber each other
  const mergePatch = (id: string, patch: Partial<ClipItem>) => {
    pendingPatches.set(id, { ...(pendingPatches.get(id) ?? {}), ...patch });
  };

  const flushPatches = () => {
    flushHandle = null;
    if (pendingPatches.size === 0) return;
    const snapshot = new Map(pendingPatches);
    pendingPatches.clear();

    const applyPatch = (c: ClipItem): ClipItem => {
      const p = snapshot.get(c.id);
      return p ? { ...c, ...p } : c;
    };

    sessionClips = sessionClips.map(applyPatch);
    if (isOnScreen()) {
      useAppStateStore.setState((s) => ({
        clips: s.clips.map(applyPatch),
        // bgProgress stays with the import that owns the view: a background
        // episode must not make the app look busy while you browse another
        bgProgress:
          focusGrid && clipTotal > 0 && clipDone < clipTotal
            ? { done: clipDone, total: clipTotal }
            : s.bgProgress,
      }));
    }
    deps.setEpisodes((prev) =>
      prev.map((ep) => (ep.id === episodeId ? { ...ep, clips: ep.clips.map(applyPatch) } : ep))
    );
  };

  const scheduleFlush = () => {
    if (flushHandle === null) flushHandle = requestAnimationFrame(flushPatches);
  };

  const cancelFlush = () => {
    if (flushHandle !== null) {
      cancelAnimationFrame(flushHandle);
      flushHandle = null;
    }
  };

  const unlistenInitial = await listen<{
    clips_json: string;
    episode_cache_id?: string | null;
  }>("initial_clips_ready", (event) => {
    if (!isMine(event.payload)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.payload.clips_json);
    } catch {
      return;
    }
    const clips = parseManifestInitialClips({ initialClips: parsed }, episodeId);
    if (clips.length === 0) return;

    const entry: EpisodeEntry = {
      id: episodeId,
      displayName: clips[0]?.originalName || fileNameFromPath(file),
      videoPath: file,
      folderId: deps.selectedFolderId,
      importedAt: Date.now(),
      clips,
      importMethod: deps.importMethod,
    };
    sessionClips = clips;
    clipDone = 0;
    clipTotal = clips.length;
    // the episode lands in the sidebar the moment its scenes are known, so a
    // batch makes each one openable as it arrives rather than at the end
    deps.setEpisodes((prev) => [entry, ...prev.filter((ep) => ep.id !== episodeId)]);

    if (!focusGrid) return;

    deps.setSelectedEpisodeId(episodeId);
    deps.setOpenedEpisodeId(episodeId);
    // reveal the grid now: only detection has run, cutting has not started. tiles
    // show their own skeleton and fill in as clip_ready arrives. bgProgress
    // tracks the cut and doubles as the busy flag, so a second import cannot
    // start mid-cut
    useAppStateStore.setState({
      clips,
      loading: false,
      bgProgress: { done: 0, total: clips.length },
    });
  });

  const unlistenClip = await listen<{
    scene_index: number;
    clip_path: string | null;
    clip_mode: string;
    episode_cache_id?: string | null;
  }>("clip_ready", (event) => {
    if (!isMine(event.payload)) return;
    const { scene_index, clip_path, clip_mode } = event.payload;
    mergePatch(`${episodeId}_${scene_index}`, {
      clipPath: clip_path ?? undefined,
      clipMode: clip_mode || undefined,
    });
    clipDone += 1;
    scheduleFlush();
  });

  // a scene's static jpg poster finished, so the grid can swap its skeleton
  const unlistenThumb = await listen<{
    position: number;
    episode_cache_id?: string | null;
  }>("thumbnail_ready", (event) => {
    if (!isMine(event.payload)) return;
    mergePatch(`${episodeId}_${event.payload.position}`, { thumbnailReady: true });
    scheduleFlush();
  });

  // keyframe copies done. the grid is already visible, so this only clears the
  // busy flag; phase-2 re-encodes keep streaming and deliberately do not block a
  // new import
  const unlistenPhase1 = await listen<{ episode_cache_id?: string | null }>(
    "phase1_complete",
    (event) => {
      if (!isMine(event.payload)) return;
      // flush synchronously so every keyframe clip path is in the store before
      // the import resolves
      cancelFlush();
      flushPatches();
      if (focusGrid) useAppStateStore.setState({ loading: false, bgProgress: null });
      resolvePhase1();
    }
  );

  const unlistenReencode = await listen<{
    done: number;
    total: number;
    episode_cache_id?: string | null;
  }>("reencode_progress", (event) => {
    if (!isMine(event.payload)) return;
    const { done, total } = event.payload;
    useAppStateStore.setState({
      reencodeProgress: total > 0 && done < total ? { done, total } : null,
    });
  });

  const stop = () => {
    // apply anything buffered right before teardown so no patch is dropped
    cancelFlush();
    flushPatches();
    unlistenInitial();
    unlistenClip();
    unlistenThumb();
    unlistenPhase1();
    unlistenReencode();
    // bgProgress normally clears at phase1_complete; this covers the process
    // dying mid-cut, which would leave the import permanently busy. only the
    // session that owns the view may clear it, or a background episode finishing
    // would wipe the active import's progress
    if (focusGrid) {
      useAppStateStore.setState({ reencodeProgress: null, bgProgress: null });
    }
  };

  return { stop, phase1Done, getClips: () => sessionClips };
}
