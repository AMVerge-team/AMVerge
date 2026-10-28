import { listen } from "@tauri-apps/api/event";
import { ClipItem, EpisodeEntry } from "../../types/domain";
import { fileNameFromPath } from "../../utils/episodeUtils";
import { useAppStateStore } from "../../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { parseManifestInitialClips } from "./manifest";
import { createClipPatchBuffer } from "./clipPatchBuffer";

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
 * flight at once (one finishing its posters while the next starts) and each
 * session only reacts to its own events
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
  // marks the episode as processing, so it never shows as paused or gets resumed mid-import
  useAppStateStore.setState((s) => ({
    liveImportEpisodeIds: [...s.liveImportEpisodeIds.filter((id) => id !== episodeId), episodeId],
  }));
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

  // clip_ready patches arrive in bursts; applying each as its own setState froze
  // the UI during import (two O(n) store maps per event), so they flush per frame
  const patches = createClipPatchBuffer((applyPatch) => {
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
  });

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
    clipDone += 1;
    patches.patch(`${episodeId}_${scene_index}`, {
      clipPath: clip_path ?? undefined,
      clipMode: clip_mode || undefined,
    });
  });

  // a scene's static jpg poster finished, so the grid can swap its skeleton
  const unlistenThumb = await listen<{
    position: number;
    episode_cache_id?: string | null;
  }>("thumbnail_ready", (event) => {
    if (!isMine(event.payload)) return;
    patches.patch(`${episodeId}_${event.payload.position}`, { thumbnailReady: true });
  });

  // the initial preview phase is complete. the grid is already visible, so this
  // only clears the busy flag; exact AI previews keep streaming and deliberately
  // do not block a new import
  const unlistenPhase1 = await listen<{ episode_cache_id?: string | null }>(
    "phase1_complete",
    (event) => {
      if (!isMine(event.payload)) return;
      // flush synchronously so every completed preview path is in the store
      // before the import resolves
      patches.flushNow();
      if (focusGrid) useAppStateStore.setState({ loading: false, bgProgress: null });
      resolvePhase1();
    }
  );

  const stop = () => {
    // apply anything buffered right before teardown so no patch is dropped
    patches.flushNow();
    useAppStateStore.setState((s) => ({
      liveImportEpisodeIds: s.liveImportEpisodeIds.filter((id) => id !== episodeId),
    }));
    unlistenInitial();
    unlistenClip();
    unlistenThumb();
    unlistenPhase1();
    // bgProgress normally clears at phase1_complete; this covers the process
    // dying mid-cut, which would leave the import permanently busy. only the
    // session that owns the view may clear it, or a background episode finishing
    // would wipe the active import's progress
    if (focusGrid) {
      useAppStateStore.setState({ bgProgress: null });
    }
  };

  return { stop, phase1Done, getClips: () => sessionClips };
}
