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

/** streaming import events for one episode; payloads carry their episode, and `focusGrid` decides if it takes the view */
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
  // this session's clips; the grid mirrors them only while this episode has focus
  let sessionClips: ClipItem[] = [];

  const isMine = (payload: { episode_cache_id?: string | null }) =>
    !payload.episode_cache_id || payload.episode_cache_id === episodeId;

  // checked live: the user can open a background episode any time
  const isOnScreen = () =>
    useEpisodePanelRuntimeStore.getState().openedEpisodeId === episodeId;

  // clip_ready bursts flush per frame; one setState each froze the UI
  const patches = createClipPatchBuffer((applyPatch) => {
    sessionClips = sessionClips.map(applyPatch);
    if (isOnScreen()) {
      useAppStateStore.setState((s) => ({
        clips: s.clips.map(applyPatch),
        // only the import owning the view sets bgProgress
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
    // the episode joins the sidebar as soon as its scenes are known
    deps.setEpisodes((prev) => [entry, ...prev.filter((ep) => ep.id !== episodeId)]);

    if (!focusGrid) return;

    deps.setSelectedEpisodeId(episodeId);
    deps.setOpenedEpisodeId(episodeId);
    // reveal the grid after detection; tiles fill in on clip_ready, and bgProgress blocks a second import mid-cut
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

  // preview phase done: only clears the busy flag; AI previews keep streaming
  const unlistenPhase1 = await listen<{ episode_cache_id?: string | null }>(
    "phase1_complete",
    (event) => {
      if (!isMine(event.payload)) return;
      // flushed so every finished preview is in the store before the import resolves
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
    // clears bgProgress if the process died mid-cut; only the view-owning session may
    if (focusGrid) {
      useAppStateStore.setState({ bgProgress: null });
    }
  };

  return { stop, phase1Done, getClips: () => sessionClips };
}
