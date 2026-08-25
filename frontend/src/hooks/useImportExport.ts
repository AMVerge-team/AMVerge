import { useRef, startTransition, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ClipItem, EpisodeEntry } from "../types/domain"
import { fileNameFromPath, truncateFileName, loadEpisodeManifest } from "../utils/episodeUtils";
import {
  getRecommendedContainerForCodec,
  isExportCodecContainerCompatible,
} from "../features/export/profiles";

import { runPostExportPasses } from "../features/export/runPostExportPasses";
import { anyPassEnabled, PASS_SUFFIX, type PostExportPasses } from "../features/export/postPasses";
import { clipExportSpecs } from "../features/export/clipSpecs";
import { deliverExportedFiles } from "../features/export/deliverExports";
import { useAiDepsStore } from "../stores/aiDepsStore";
import { useAppStateStore, useAppPersistedStore } from "../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";

type ImportExportProps = {
  abortedRef?: React.RefObject<boolean>;
  onRPCUpdate?: (data: any) => void;
};
type ExportOptionsPayload = {
  profileId: string;
  workflow: string;
  editorTarget: string;
  codec: string;
  audioMode: string;
  hardwareMode: string;
  parallelExports: number;
};

// strip path separators, control chars, and reserved characters; collapse to a
// safe filename. Prevents traversal injection (e.g. "../foo").
function sanitizeExportBaseName(rawBase: string): string {
  return (rawBase
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/^\.+/, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)) || "merged";
}

export default function useImportExport(props?: ImportExportProps) {
  // Selectors, not the whole store: this hook is used by PreviewContainer and
  // ImportButtons, and subscribing to everything re-rendered both on every
  // progress tick during an import.
  const loading = useAppStateStore((s) => s.loading);
  const importToken = useAppStateStore((s) => s.importToken);
  const batchTotal = useAppStateStore((s) => s.batchTotal);
  const batchDone = useAppStateStore((s) => s.batchDone);
  const batchCurrentFile = useAppStateStore((s) => s.batchCurrentFile);
  const setLoading = useAppStateStore((s) => s.setLoading);
  const setActiveOperation = useAppStateStore((s) => s.setActiveOperation);
  const setBgImportProgress = useAppStateStore((s) => s.setBgImportProgress);
  const setImportToken = useAppStateStore((s) => s.setImportToken);
  const setBatchTotal = useAppStateStore((s) => s.setBatchTotal);
  const setBatchDone = useAppStateStore((s) => s.setBatchDone);
  const setBatchCurrentFile = useAppStateStore((s) => s.setBatchCurrentFile);
  const episodeState = useEpisodePanelRuntimeStore();
  const generalSettings = useGeneralSettingsStore();
  const persistedState = useAppPersistedStore();

  const importGenRef = useRef(0);
  const localAbortedRef = useRef(false);
  const abortedRef = props?.abortedRef || localAbortedRef;
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const logImportError = useCallback((phase: string, error: unknown, context?: Record<string, unknown>) => {
    const details = {
      phase,
      context: context ?? {},
      message: error instanceof Error ? error.message : String(error),
      error,
    };
    console.error("[import] failure", details);
  }, []);
  const buildExportOptionsPayload = useCallback((profileId: string): ExportOptionsPayload | undefined => {
    const profile = generalSettings.exportProfiles.find((candidate) => candidate.id === profileId)
      ?? generalSettings.exportProfiles[0];
    if (!profile) return undefined;

    let audioMode = profile.audioMode;
    if (profile.container === "mov" && audioMode === "flac") {
      audioMode = "alac";
    }

    return {
      profileId: profile.id,
      workflow: profile.workflow,
      editorTarget: profile.editorTarget,
      codec: profile.codec,
      audioMode,
      hardwareMode: profile.hardwareMode,
      parallelExports: profile.parallelExports,
    };
  }, [generalSettings.exportProfiles]);

  function parseManifestInitialClips(manifest: any, episodeId: string): ClipItem[] {
    const raw = Array.isArray(manifest?.initialClips) ? manifest.initialClips : [];

    const clipsFromInitial = raw.map((s: any, index: number) => ({
      id: `${episodeId}_${typeof s?.scene_index === "number" ? s.scene_index : index}`,
      src: s.path,
      thumbnail: s.thumbnail,
      thumbnailReady: s.thumbnail_ready !== false,
      originalName: s.original_file,
      originalPath: s.original_path,
      sceneIndex: typeof s.scene_index === "number" ? s.scene_index : undefined,
      startSec: typeof s.start_sec === "number" ? s.start_sec : undefined,
      endSec: typeof s.end_sec === "number" ? s.end_sec : undefined,
      clipPath: typeof s.clip_path === "string" ? s.clip_path : undefined,
      clipMode: typeof s.clip_mode === "string" && s.clip_mode ? s.clip_mode : undefined,
    }));

    if (clipsFromInitial.length > 0) {
      return clipsFromInitial;
    }

    const sourceVideoPath = typeof manifest?.source?.videoPath === "string" ? manifest.source.videoPath : null;
    const sourceVideoName = sourceVideoPath ? fileNameFromPath(sourceVideoPath) : undefined;
    const scenes = Array.isArray(manifest?.scenes) ? manifest.scenes : [];

    return scenes.map((scene: any, index: number) => {
      const startSec = typeof scene?.start_sec === "number" ? scene.start_sec : undefined;
      const endSec = typeof scene?.end_sec === "number" ? scene.end_sec : undefined;
      const sceneIndex = typeof scene?.scene_index === "number" ? scene.scene_index : index;

      return {
        id: `${episodeId}_${sceneIndex}`,
        src: sourceVideoPath || "",
        thumbnail: sourceVideoPath || "",
        originalName: sourceVideoName,
        originalPath: sourceVideoPath || undefined,
        sceneIndex,
        startSec,
        endSec,
      };
    });
  }

  function buildEpisodeCacheId(file: string): string {
    const fileName = fileNameFromPath(file);
    const stem = fileName.replace(/\.[^./\\]+$/, "");
    const sanitizedStem = stem
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    const safeStem = sanitizedStem.length > 0 ? sanitizedStem : "episode";
    const shortSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    return `${safeStem}_${shortSuffix}`;
  }

  /**
   * Wire the streaming import events for one episode.
   *
   * Every payload carries the episode it belongs to, so several imports can be
   * in flight at once - a batch keeps re-encoding one episode while cutting the
   * next - and each session only reacts to its own events.
   *
   * `focusGrid` decides whether this episode takes over the view. The batch only
   * grants it to the first episode; the rest fill their own buffer and appear in
   * the sidebar without disturbing whatever the user is browsing.
   */
  const startVideoStreamingListeners = useCallback(async (
    file: string,
    episodeId: string,
    focusGrid = true,
  ): Promise<{
    stop: () => void;
    phase1Done: Promise<void>;
    getClips: () => ClipItem[];
  }> => {
    let unlistenInitial: (() => void) | null = null;
    let unlistenClip: (() => void) | null = null;
    let unlistenThumb: (() => void) | null = null;
    let unlistenPhase1: (() => void) | null = null;
    let unlistenReencode: (() => void) | null = null;

    let resolvePhase1: () => void = () => {};
    const phase1Done = new Promise<void>((resolve) => {
      resolvePhase1 = resolve;
    });

    let clipDone = 0;
    let clipTotal = 0;
    // This session's own copy of the clips. The grid store only mirrors it when
    // this episode holds focus, so a background import can never overwrite the
    // episode on screen.
    let sessionClips: ClipItem[] = [];

    /** Events for other episodes belong to another session. */
    const isMine = (payload: { episode_cache_id?: string | null }) =>
      !payload.episode_cache_id || payload.episode_cache_id === episodeId;

    /**
     * Whether this episode is the one on screen right now - checked live, not
     * captured. `focusGrid` only says whether the import opens itself; the user
     * can open a background episode at any point, and its patches have to start
     * reaching the grid from then on.
     */
    const isOnScreen = () =>
      useEpisodePanelRuntimeStore.getState().openedEpisodeId === episodeId;

    unlistenInitial = await listen<{ clips_json: string; episode_cache_id?: string | null }>(
      "initial_clips_ready",
      (event) => {
      if (!isMine(event.payload)) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.payload.clips_json);
      } catch {
        return;
      }
      const clips = parseManifestInitialClips({ initialClips: parsed }, episodeId);
      if (clips.length === 0) return;

      const inferredName = clips[0]?.originalName || fileNameFromPath(file);
      const entry: EpisodeEntry = {
        id: episodeId,
        displayName: inferredName,
        videoPath: file,
        folderId: episodeState.selectedFolderId,
        importedAt: Date.now(),
        clips,
        importMethod: generalSettings.importMethod,
      };
      sessionClips = clips;
      clipDone = 0;
      clipTotal = clips.length;
      // The episode lands in the sidebar the moment its scenes are known, so a
      // batch makes each one openable as it arrives rather than at the end.
      episodeState.setEpisodes((prev) => [entry, ...prev.filter((ep) => ep.id !== episodeId)]);

      if (!focusGrid) return;

      episodeState.setSelectedEpisodeId(episodeId);
      episodeState.setOpenedEpisodeId(episodeId);
      // reveal the grid now: only detection has run, cutting hasn't started. tiles
      // show their own skeleton and fill in as clip_ready arrives, so the episode
      // is browsable while cutting continues.
      // bgProgress tracks the cut and doubles as the "import busy" flag `loading`
      // used to provide, so a second import can't start mid-cut.
      useAppStateStore.setState({
        clips,
        loading: false,
        bgProgress: { done: 0, total: clips.length },
      });
    });

    // coalesce clip_ready patches. Keyframe copies finish in bursts — applying
    // each as its own setState re-renders the whole grid every time (two O(n)
    // store maps per event), which freezes the UI during import. Instead we
    // buffer patches by clip id and flush them all in a single update per frame.
    const pendingPatches = new Map<string, Partial<ClipItem>>();
    // merge (not replace) so a clip_ready and a thumbnail_ready for the same clip
    // within one frame don't clobber each other.
    const mergePatch = (id: string, patch: Partial<ClipItem>) => {
      pendingPatches.set(id, { ...(pendingPatches.get(id) ?? {}), ...patch });
    };
    let flushHandle: number | null = null;

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
          // advance the cut counter on the same frame as the clip patches. Left
          // untouched once every clip is in — phase1_complete clears it.
          // bgProgress stays with the import that owns the view: a background
          // episode must not make the app look busy while you browse another.
          bgProgress: focusGrid && clipTotal > 0 && clipDone < clipTotal
            ? { done: clipDone, total: clipTotal }
            : s.bgProgress,
        }));
      }
      episodeState.setEpisodes((prev) =>
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

    unlistenClip = await listen<{
      scene_index: number;
      clip_path: string | null;
      clip_mode: string;
      episode_cache_id?: string | null;
    }>(
      "clip_ready",
      (event) => {
        if (!isMine(event.payload)) return;
        const { scene_index, clip_path, clip_mode } = event.payload;
        mergePatch(`${episodeId}_${scene_index}`, {
          clipPath: clip_path ?? undefined,
          clipMode: clip_mode || undefined,
        });
        clipDone += 1;
        scheduleFlush();
      }
    );

    // static jpg poster finished for a scene → flip its thumbnailReady so the
    // grid swaps the skeleton for the still image (mirrors production).
    unlistenThumb = await listen<{ position: number; episode_cache_id?: string | null }>(
      "thumbnail_ready",
      (event) => {
      if (!isMine(event.payload)) return;
      const { position } = event.payload;
      mergePatch(`${episodeId}_${position}`, { thumbnailReady: true });
      scheduleFlush();
    });

    // keyframe copies done. the grid is already visible, so this only clears the
    // busy flag. phase-2 re-encodes keep streaming in the background under
    // reencodeProgress, which deliberately does not block a new import.
    unlistenPhase1 = await listen<{ episode_cache_id?: string | null }>(
      "phase1_complete",
      (event) => {
      if (!isMine(event.payload)) return;
      // flush synchronously so every keyframe clip path is in the store before
      // the import resolves.
      cancelFlush();
      flushPatches();
      if (focusGrid) useAppStateStore.setState({ loading: false, bgProgress: null });
      resolvePhase1();
    });

    // background phase-2 re-encode progress → drives the "Reencoding X/Y" count
    // in the draggable background progress bar. Cleared once it reaches total.
    unlistenReencode = await listen<{
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
      // apply any patches buffered right before teardown so none are dropped.
      cancelFlush();
      flushPatches();
      if (unlistenInitial) unlistenInitial();
      if (unlistenClip) unlistenClip();
      if (unlistenThumb) unlistenThumb();
      if (unlistenPhase1) unlistenPhase1();
      if (unlistenReencode) unlistenReencode();
      // clear any lingering progress indicators for this session. bgProgress is
      // normally cleared at phase1_complete; this covers the process dying
      // mid-cut, which would otherwise leave the import permanently "busy".
      // Only the session that owns the view may clear them - a background
      // episode finishing would otherwise wipe the active import's progress.
      if (focusGrid) {
        useAppStateStore.setState({ reencodeProgress: null, bgProgress: null });
      }
    };

    return { stop, phase1Done, getClips: () => sessionClips };
  }, [episodeState, generalSettings.importMethod]);

  const runImportPipeline = useCallback(async (
    file: string,
    episodeId: string,
    streamToGrid = false,
    // Batch imports stream every episode but only the first one takes the view.
    focusGrid = streamToGrid,
  ): Promise<{
    episodeEntry: EpisodeEntry;
    sceneCount: number;
  }> => {
    // video mode streams clips into the grid as they're cut and resolves the
    // import once the keyframe copies land; re-encodes finish in the background.
    const videoStreaming = streamToGrid && generalSettings.importMethod === "video_files";

    // Safety net for the settings gate: the ml pack could have been removed (or
    // the setting carried over from an older install) since it was chosen.
    // Prompt here rather than letting the backend fail mid-import.
    if (generalSettings.sceneDetectionMethod === "transnetv2_gpu") {
      const ready = await useAiDepsStore.getState().ensurePack("ml");
      if (!ready) {
        throw new Error(
          "TransNetV2 is not installed. Install it, or switch scene detection to Keyframe Detection in Settings.",
        );
      }
    }

    if (videoStreaming) {
      // Sessions no longer need to be torn down for each other: every event
      // carries its episode id, so an earlier import's phase-2 keeps patching
      // its own episode while this one starts.
      const { stop, phase1Done, getClips } = await startVideoStreamingListeners(
        file,
        episodeId,
        focusGrid,
      );
      const previousCleanup = streamCleanupRef.current;
      streamCleanupRef.current = () => {
        previousCleanup?.();
        stop();
      };

      // fire detection but DON'T block import completion on it — the process
      // keeps running phase-2 after phase1_complete. Listeners are torn down
      // only when the whole process ends (success or failure).
      let invokeError: unknown = null;
      const invokeSettled = invoke("detect_scenes", {
        videoPath: file,
        episodeCacheId: episodeId,
        customPath: generalSettings.episodesPath,
        sceneDetectionMethod: generalSettings.sceneDetectionMethod,
        importMethod: generalSettings.importMethod,
      })
        .catch((err) => { invokeError = err; })
        .finally(() => {
          stop();
        });

      // whichever happens first: phase-1 done (normal) or the process ending
      // before phase-1 (error, or a video that produced no scenes).
      const winner = await Promise.race([
        phase1Done.then(() => "phase1" as const),
        invokeSettled.then(() => "invoke" as const),
      ]);

      if (winner === "phase1") {
        // build the entry from this session's streamed clips (phase-1 paths
        // included); phase-2 patches continue arriving in the background. Read
        // from the session, not the grid - a background episode never wrote there.
        const streamedClips = getClips();
        const inferredName = streamedClips[0]?.originalName || fileNameFromPath(file);
        const episodeEntry: EpisodeEntry = {
          id: episodeId,
          displayName: inferredName,
          videoPath: file,
          folderId: episodeState.selectedFolderId,
          importedAt: Date.now(),
          clips: streamedClips,
          importMethod: "video_files",
        };
        return { episodeEntry, sceneCount: streamedClips.length };
      }

      // process ended before any phase-1 signal.
      if (invokeError) throw invokeError;
      // defensive fallback (no scenes / no phase-1 emitted): detect_scenes already
      // ran above, so skip straight to manifest hydration below.
    } else {
      // non-streaming path (webp_files, and any non-streaming import): no streaming
      // listeners are wired, so run detection to completion here. This writes the
      // manifest the hydration step below reads. (Without this, brand-new episodes
      // have no manifest on disk and loadEpisodeManifest fails with os error 3.)
      await invoke("detect_scenes", {
        videoPath: file,
        episodeCacheId: episodeId,
        customPath: generalSettings.episodesPath,
        sceneDetectionMethod: generalSettings.sceneDetectionMethod,
        importMethod: generalSettings.importMethod,
      });
    }

    const manifest = await loadEpisodeManifest(episodeId, generalSettings.episodesPath);
    const clips = parseManifestInitialClips(manifest, episodeId);
    if (clips.length === 0) {
      throw new Error("Manifest import path produced no clips.");
    }

    const manifestMethod = manifest?.source?.importMethod;
    const episodeImportMethod: EpisodeEntry["importMethod"] =
      manifestMethod === "webp_files" || manifestMethod === "video_files"
        ? manifestMethod
        : generalSettings.importMethod;

    const inferredName = clips[0]?.originalName || fileNameFromPath(file);
    const episodeEntry: EpisodeEntry = {
      id: episodeId,
      displayName: inferredName,
      videoPath: file,
      folderId: episodeState.selectedFolderId,
      importedAt: Date.now(),
      clips,
      importMethod: episodeImportMethod,
    };

    const sceneCount = Array.isArray(manifest?.scenes) ? manifest.scenes.length : clips.length;
    return { episodeEntry, sceneCount };
  }, [generalSettings.episodesPath, generalSettings.sceneDetectionMethod, generalSettings.importMethod, episodeState.selectedFolderId, startVideoStreamingListeners]);

  const handleImport = useCallback(async (file: string | null) => {
    if (!file) return;
    const currentState = useAppStateStore.getState();
    if (currentState.loading || currentState.bgProgress || currentState.bgImportProgress) return;

    console.info("[import] start", { mode: "single", file, episodePath: generalSettings.episodesPath });

    const episodeId = buildEpisodeCacheId(file);
    const gen = ++importGenRef.current;

    try {
      useAppStateStore.getState().setProgress(0);
      useAppStateStore.getState().setProgressMsg("Starting...");
      setActiveOperation("import");
      setLoading(true);
      useAppStateStore.getState().setSelectedClips(new Set());
      useAppStateStore.getState().setFocusedClip(null);
      useAppStateStore.getState().setFocusedClipId(null);
      useAppStateStore.getState().setImportedVideoPath(file);
      useAppStateStore.getState().setVideoIsHEVC(null);
      setImportToken(Date.now().toString());
      props?.onRPCUpdate?.({
        type: "update",
        details: `Detecting: ${generalSettings.rpcShowFilename ? fileNameFromPath(file) : "Video"}`,
        state: "Processing Video",
        large_image: "amverge_logo",
        small_image: generalSettings.rpcShowMiniIcons ? "loading_icon_new" : undefined,
        small_text: generalSettings.rpcShowMiniIcons ? "Detecting..." : undefined,
      });

      const { episodeEntry, sceneCount } = await runImportPipeline(file, episodeId, true);

      // replace (not duplicate) the entry the streaming listener may have added.
      episodeState.setEpisodes((prev) => [episodeEntry, ...prev.filter((ep) => ep.id !== episodeId)]);
      episodeState.setSelectedEpisodeId(episodeId);
      episodeState.setOpenedEpisodeId(episodeId);
      useAppStateStore.setState({ clips: episodeEntry.clips });

      console.info("[import] manifest hydration path", {
        mode: "single",
        episodeId,
        clips: episodeEntry.clips.length,
        scenes: sceneCount,
      });
      console.info("[import] detect_scenes completed", { mode: "single", file, episodeId });
    } catch (err) {
      if (importGenRef.current !== gen) return;
      logImportError("single.detect_scenes", err, {
        file,
        episodeId,
        episodePath: generalSettings.episodesPath,
        importGeneration: gen,
      });
      useAppStateStore.setState({ bgProgress: null });
    } finally {
      if (importGenRef.current === gen) {
        setLoading(false);
        setActiveOperation(null);
      }
      console.info("[import] finished", { mode: "single", file, episodeId, importGeneration: gen });
    }
  }, [episodeState, generalSettings, props?.onRPCUpdate, logImportError, runImportPipeline]);

  const handleBatchImport = useCallback(async (files: string[]) => {
    if (files.length === 0) return;
    const currentState = useAppStateStore.getState();
    if (currentState.loading || currentState.bgProgress || currentState.bgImportProgress) return;

    const gen = ++importGenRef.current;
    abortedRef.current = false;
    const completedEpisodes: EpisodeEntry[] = [];
    console.info("[import] start", {
      mode: "batch",
      files: files.length,
      episodePath: generalSettings.episodesPath,
    });
    try {
      useAppStateStore.getState().setProgress(0);
      useAppStateStore.getState().setProgressMsg("Starting...");
      setActiveOperation("import");
      // batch shows the full loading screen (minimizable). bgImportProgress is
      // still tracked so closing the minimized card aborts remaining episodes.
      setLoading(true);
      useAppStateStore.getState().setSelectedClips(new Set());
      useAppStateStore.getState().setFocusedClip(null);
      useAppStateStore.getState().setFocusedClipId(null);
      useAppStateStore.getState().setVideoIsHEVC(null);
      useAppStateStore.setState({ bgProgress: null });
      setBgImportProgress({ done: 0, total: files.length });
      setImportToken(Date.now().toString());
      setBatchTotal(files.length);
      setBatchDone(0);
      setBatchCurrentFile("");

      for (let i = 0; i < files.length; i++) {
        if (abortedRef.current) break;
        if (importGenRef.current !== gen) return;
        const file = files[i];
        const episodeId = buildEpisodeCacheId(file);
        const fileName = fileNameFromPath(file);
        setBatchDone(i);
        setBatchCurrentFile(truncateFileName(fileName));
        useAppStateStore.getState().setProgress(0);
        useAppStateStore.getState().setProgressMsg("Starting...");
        useAppStateStore.setState({ bgProgress: null });
        console.info("[import] batch file begin", {
          index: i + 1,
          total: files.length,
          file,
          episodeId,
        });

        try {
          // Stream every episode so it appears as soon as its keyframe cuts land
          // and re-encodes finish in the background. Only the first takes the
          // grid; the rest fill the sidebar without moving the user's view.
          const { episodeEntry, sceneCount: manifestSceneCount } = await runImportPipeline(
            file,
            episodeId,
            true,
            completedEpisodes.length === 0,
          );
          console.info("[import] manifest verified", {
            mode: "batch",
            episodeId,
            scenes: manifestSceneCount,
          });
          if (abortedRef.current || importGenRef.current !== gen) {
            invoke("delete_episode_cache", {
              episodeCacheId: episodeId,
              customPath: generalSettings.episodesPath,
            }).catch(() => { });
            break;
          }

          completedEpisodes.push(episodeEntry);
          // The streaming listener already inserted this episode when its scenes
          // were detected, so replace that entry rather than adding a second one.
          episodeState.setEpisodes((prev) => [
            episodeEntry,
            ...prev.filter((ep) => ep.id !== episodeEntry.id),
          ]);
          setBgImportProgress({ done: i + 1, total: files.length });

          // first finished episode: open it in the grid and drop the full-screen
          // loader (it auto-minimizes to the batch card since bgImportProgress is
          // still active) so completed episodes are browsable while the rest keep
          // processing. Later episodes only stream into the sidebar above — we
          // don't yank the user's current view by auto-switching to each one.
          if (completedEpisodes.length === 1) {
            episodeState.setSelectedEpisodeId(episodeEntry.id);
            episodeState.setOpenedEpisodeId(episodeEntry.id);
            useAppStateStore.getState().setImportedVideoPath(episodeEntry.videoPath);
            setImportToken(Date.now().toString());
            startTransition(() => {
              useAppStateStore.getState().setClips(episodeEntry.clips);
            });
            setLoading(false);
          }
          console.info("[import] batch file success", {
            index: i + 1,
            total: files.length,
            file,
            episodeId,
            clips: episodeEntry.clips.length,
          });
        } catch (err) {
          if (abortedRef.current) {
            invoke("delete_episode_cache", {
              episodeCacheId: episodeId,
              customPath: generalSettings.episodesPath,
            }).catch(() => { });
            break;
          }
          logImportError("batch.detect_scenes", err, {
            index: i + 1,
            total: files.length,
            file,
            fileName,
            episodeId,
            episodePath: generalSettings.episodesPath,
          });
          invoke("delete_episode_cache", {
            episodeCacheId: episodeId,
            customPath: generalSettings.episodesPath,
          }).catch(() => { });
          setBgImportProgress({ done: i + 1, total: files.length });
        }
      }

      // the first finished episode is already opened mid-loop (see above), and
      // every completed episode streams into the sidebar as it finishes, so
      // there's nothing to reveal here at the end — re-opening would yank the
      // user off whichever episode they're currently viewing.
    } finally {

      if (importGenRef.current === gen) {
        setLoading(false);
        setActiveOperation(null);
        setBgImportProgress(null);
        useAppStateStore.setState({ bgProgress: null });
        setBatchTotal(0);
        setBatchDone(0);
        setBatchCurrentFile(null);
      }
      console.info("[import] finished", {
        mode: "batch",
        requested: files.length,
        completed: completedEpisodes.length,
        importGeneration: gen,
      });
    }
  }, [episodeState, generalSettings, abortedRef, setBgImportProgress, logImportError, runImportPipeline]);

  const onImportClick = useCallback(async () => {
    const currentState = useAppStateStore.getState();
    if (currentState.loading || currentState.bgProgress || currentState.bgImportProgress) return;

    try {
      const files = await open({
        multiple: true,
        filters: [{ name: "Video", extensions: ["mp4", "mkv", "mov", "avi"] }],
      });
      if (!files) {
        console.info("[import] picker canceled");
        return;
      }

      const fileList = Array.isArray(files) ? files : [files];
      if (fileList.length === 0) {
        console.warn("[import] picker returned no files");
        return;
      }

      if (fileList.length === 1) {
        await handleImport(fileList[0]);
      } else {
        await handleBatchImport(fileList);
      }
    } catch (err) {
      logImportError("picker.open", err);
    }
  }, [handleImport, handleBatchImport, logImportError]);

  const handleExport = useCallback(async (selectedClips: Set<string>, mergeEnabled: boolean, mergeFileName?: string) => {
    console.log(`[handleExport] selectedClips.size=${selectedClips.size} useAppStateStore.getState().clips.length=${useAppStateStore.getState().clips.length} IDs=[${[...selectedClips].slice(0, 3).join(',')}]`);
    if (selectedClips.size === 0) return;
    const selected = useAppStateStore.getState().clips.filter((c: ClipItem) => selectedClips.has(c.id));
    console.log(`[handleExport] matched ${selected.length} clips from store`);
    if (selected.length === 0) return;
    let dir = persistedState.exportDir;
    if (!dir) {
      const picked = await open({ directory: true, multiple: false });
      if (!picked) return;
      dir = picked as string;
      persistedState.setExportDir(dir);
    }
    // files produced by the export, fed to the post-export passes after the
    // export loader closes. Stays empty on failure so no passes run.
    let producedFiles: string[] = [];
    const passesSnapshot = generalSettings.postExportPasses;

    // Merge + interpolation: interpolation must run per-clip (before the merge)
    // so it never synthesizes frames across cut boundaries. The merged timeline
    // is built afterwards from the interpolated clips.
    if (mergeEnabled && passesSnapshot.interpolation.enabled) {
      const sep = dir.includes('\\') ? '\\' : '/';
      const clipArray = selected.flatMap(clipExportSpecs);
      const exportOptions = buildExportOptionsPayload(generalSettings.activeExportProfileId);
      const activeProfile = generalSettings.exportProfiles.find(
        (candidate) => candidate.id === generalSettings.activeExportProfileId
      ) ?? generalSettings.exportProfiles[0];
      const preferredFormat = activeProfile?.container || "mp4";
      const format =
        activeProfile &&
        activeProfile.workflow === "video_encode" &&
        !isExportCodecContainerCompatible(activeProfile.codec, preferredFormat)
          ? getRecommendedContainerForCodec(activeProfile.codec)
          : preferredFormat;

      const mergeBase = (selected[0]?.originalName || "episode").replace(/\.[^./\\]+$/, "");
      const rawBase = mergeFileName || (mergeBase + "_merged");
      const baseName = sanitizeExportBaseName(rawBase);
      const finalSavePath = `${dir}${sep}${baseName}.${format}`;

      let mergedFiles: string[] = [];

      try {
      props?.onRPCUpdate?.({
        type: "update",
        details: `Exporting ${selected.length} clips`,
        state: "Saving Progress",
        large_image: "amverge_logo",
        small_image: generalSettings.rpcShowMiniIcons ? "save_icon_new" : undefined,
        small_text: generalSettings.rpcShowMiniIcons ? "Exporting..." : undefined,
      });

      // 1. Export each clip on its own (no merge).
      let clipFiles: string[] = [];
      try {
        setActiveOperation("export");
        setLoading(true);
        clipFiles = await invoke<string[]>("export_clips", {
          clips: clipArray,
          savePath: `${dir}${sep}${baseName}_####.${format}`,
          mergeEnabled: false,
          exportOptions,
          audioTrack: generalSettings.previewAudioStreamIndex,
          audioLanguage: generalSettings.previewAudioLanguage,
        });
        if (clipFiles.length === 0) throw new Error("Export produced no files.");
      } finally {
        setLoading(false);
        setActiveOperation(null);
      }

      const remuxOptions: ExportOptionsPayload = {
        profileId: exportOptions?.profileId ?? "",
        workflow: "video_remux",
        editorTarget: "none",
        codec: "copy",
        audioMode: "copy",
        hardwareMode: "cpu",
        parallelExports: 1,
      };

      const mergeInto = async (inputs: string[], savePath: string) => {
        try {
          setActiveOperation("export");
          setLoading(true);
          return await invoke<string[]>("export_clips", {
            clips: inputs.map((input) => ({ input })),
            savePath,
            mergeEnabled: true,
            exportOptions: remuxOptions,
          });
        } finally {
          setLoading(false);
          setActiveOperation(null);
        }
      };

      // 2. Merge the untouched clips: this is the plain export, and it keeps the
      // name the user chose. Passes never overwrite it.
      mergedFiles = await mergeInto(clipFiles, finalSavePath);

      // 3. Interpolation runs per clip (never across a cut) and merges into its
      // own _interpolated file, so both versions survive side by side.
      const interpOnly: PostExportPasses = {
        ...passesSnapshot,
        depth: { ...passesSnapshot.depth, enabled: false },
      };
      const passOutputs = await runPostExportPasses(clipFiles, interpOnly);
      if (passOutputs.interpolated.length > 0) {
        await mergeInto(
          passOutputs.interpolated,
          `${dir}${sep}${baseName}${PASS_SUFFIX.interpolation}.${format}`
        );
      }
      // The dead-frames copies are per clip too, so they merge the same way.
      if (passOutputs.deadframes.length > 0) {
        await mergeInto(
          passOutputs.deadframes,
          `${dir}${sep}${baseName}${PASS_SUFFIX.deadframes}.${format}`
        );
      }

      // 4. Drop the per-clip parts; only the merged outputs are wanted on disk.
      const intermediates = [
        ...clipFiles,
        ...passOutputs.interpolated,
        ...passOutputs.deadframes,
      ];
      if (intermediates.length > 0) {
        try {
          await invoke("delete_export_intermediates", { dir, paths: intermediates });
        } catch (err) {
          console.warn("Failed to clean up export intermediates:", err);
        }
      }

      await deliverExportedFiles(mergedFiles);

      props?.onRPCUpdate?.({
        type: "update",
        details: "Export Finished!",
        state: "Success",
        large_image: "amverge_logo",
        small_image: generalSettings.rpcShowMiniIcons ? "check_icon_new" : undefined,
        small_text: generalSettings.rpcShowMiniIcons ? "Done" : undefined,
      });

      setTimeout(() => {
        props?.onRPCUpdate?.({
          type: "update",
          details: "Editing Episode",
          state: "Ready",
          large_image: "amverge_logo",
          small_image: generalSettings.rpcShowMiniIcons ? "edit_icon_new" : undefined,
          small_text: generalSettings.rpcShowMiniIcons ? "Editing" : undefined,
        });
      }, 10000);

      } catch (err) {
        const message = typeof err === "string"
          ? err
          : (err instanceof Error ? err.message : "Unknown error");
        console.error("Export failed:", err);
        useAppStateStore.getState().setProgressMsg(`Export failed: ${message}`);
        props?.onRPCUpdate?.({
          type: "update",
          details: "Export Failed",
          state: message.slice(0, 120),
          large_image: "amverge_logo",
          small_image: generalSettings.rpcShowMiniIcons ? "edit_icon_new" : undefined,
          small_text: generalSettings.rpcShowMiniIcons ? "Error" : undefined,
        });
        setTimeout(() => {
          useAppStateStore.getState().setProgressMsg("");
        }, 8000);
        return;
      }

      // 5. Any remaining passes (depth/deadframes) run on the merged file.
      const passesForMerged: PostExportPasses = {
        ...passesSnapshot,
        interpolation: { ...passesSnapshot.interpolation, enabled: false },
      };
      if (mergedFiles.length > 0 && anyPassEnabled(passesForMerged)) {
        void runPostExportPasses(mergedFiles, passesForMerged);
      }

      return;
    }

    try {
      setActiveOperation("export");
      setLoading(true);
      const sep = dir.includes('\\') ? '\\' : '/';
      const clipArray = selected.flatMap(clipExportSpecs);
      const exportOptions = buildExportOptionsPayload(generalSettings.activeExportProfileId);
      const activeProfile = generalSettings.exportProfiles.find(
        (candidate) => candidate.id === generalSettings.activeExportProfileId
      ) ?? generalSettings.exportProfiles[0];
      const preferredFormat = activeProfile?.container || "mp4";
      const format =
        activeProfile &&
        activeProfile.workflow === "video_encode" &&
        !isExportCodecContainerCompatible(activeProfile.codec, preferredFormat)
          ? getRecommendedContainerForCodec(activeProfile.codec)
          : preferredFormat;

      props?.onRPCUpdate?.({
        type: "update",
        details: `Exporting ${selected.length} clips`,
        state: "Saving Progress",
        large_image: "amverge_logo",
        small_image: generalSettings.rpcShowMiniIcons ? "save_icon_new" : undefined,
        small_text: generalSettings.rpcShowMiniIcons ? "Exporting..." : undefined,
      });

      if (mergeEnabled) {
        const mergeBase = (selected[0]?.originalName || "episode").replace(/\.[^./\\]+$/, "");
        const rawBase = mergeFileName || (mergeBase + "_merged");
        const baseName = sanitizeExportBaseName(rawBase);
        const savePath = `${dir}${sep}${baseName}.${format}`;
        const exportedFiles = await invoke<string[]>("export_clips", {
          clips: clipArray,
          savePath,
          mergeEnabled,
          exportOptions,
          audioTrack: generalSettings.previewAudioStreamIndex,
          audioLanguage: generalSettings.previewAudioLanguage,
        });
        producedFiles = exportedFiles;
        await deliverExportedFiles(exportedFiles);

      } else {
        const firstClipPath = selected[0]?.src || "";
        const firstFile = firstClipPath.split(/[/\\]/).pop() || `episode_0000.${format}`;
        const firstStem = firstFile.replace(/\.[^/.]+$/, "");
        const defaultBase = firstStem.replace(/_\d{4}$/, "");
        const savePath = `${dir}${sep}${defaultBase}_####.${format}`;
        const exportedFiles = await invoke<string[]>("export_clips", {
          clips: clipArray,
          savePath,
          mergeEnabled: false,
          exportOptions,
          audioTrack: generalSettings.previewAudioStreamIndex,
          audioLanguage: generalSettings.previewAudioLanguage,
        });
        producedFiles = exportedFiles;
        await deliverExportedFiles(exportedFiles);
      }

      props?.onRPCUpdate?.({
        type: "update",
        details: "Export Finished!",
        state: "Success",
        large_image: "amverge_logo",
        small_image: generalSettings.rpcShowMiniIcons ? "check_icon_new" : undefined,
        small_text: generalSettings.rpcShowMiniIcons ? "Done" : undefined,
      });

      setTimeout(() => {
        props?.onRPCUpdate?.({
          type: "update",
          details: "Editing Episode",
          state: "Ready",
          large_image: "amverge_logo",
          small_image: generalSettings.rpcShowMiniIcons ? "edit_icon_new" : undefined,
          small_text: generalSettings.rpcShowMiniIcons ? "Editing" : undefined,
        });
      }, 10000);
    } catch (err) {
      const message = typeof err === "string"
        ? err
        : (err instanceof Error ? err.message : "Unknown error");
      console.error("Export failed:", err);
      useAppStateStore.getState().setProgressMsg(`Export failed: ${message}`);
      props?.onRPCUpdate?.({
        type: "update",
        details: "Export Failed",
        state: message.slice(0, 120),
        large_image: "amverge_logo",
        small_image: generalSettings.rpcShowMiniIcons ? "edit_icon_new" : undefined,
        small_text: generalSettings.rpcShowMiniIcons ? "Error" : undefined,
      });
      setTimeout(() => {
        useAppStateStore.getState().setProgressMsg("");
      }, 8000);
    } finally {
      setLoading(false);
      setActiveOperation(null);
    }

    // export loader is now closed. Run any enabled post-export passes on the
    // produced files; the passes modal drives itself from here.
    if (producedFiles.length > 0 && anyPassEnabled(passesSnapshot)) {
      void runPostExportPasses(producedFiles, passesSnapshot);
    }
  }, [buildExportOptionsPayload, persistedState, generalSettings, props?.onRPCUpdate]);

  const handlePickExportDir = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir) persistedState.setExportDir(dir as string);
  }, [persistedState]);

  const handleDownloadSingleClip = useCallback(async (clip: ClipItem) => {
    try {
      const activeProfile = generalSettings.exportProfiles.find(
        (candidate) => candidate.id === generalSettings.activeExportProfileId
      ) ?? generalSettings.exportProfiles[0];
      const preferredFormat = activeProfile?.container || "mp4";
      const format =
        activeProfile &&
        activeProfile.workflow === "video_encode" &&
        !isExportCodecContainerCompatible(activeProfile.codec, preferredFormat)
          ? getRecommendedContainerForCodec(activeProfile.codec)
          : preferredFormat;
      const fileName = (clip.originalName || fileNameFromPath(clip.src)).replace(/\.[^./\\]+$/, "");
      const defaultPath = `${fileName}.${format}`;
      const savePath = await save({
        defaultPath,
        filters: [{ name: "Video", extensions: [format] }],
      });

      if (!savePath) return;

      setActiveOperation("export");
      setLoading(true);

      const srcs = clipExportSpecs(clip);
      const exportOptions = buildExportOptionsPayload(generalSettings.activeExportProfileId);
      const exportedFiles = await invoke<string[]>("export_clips", {
        clips: srcs,
        savePath,
        mergeEnabled: srcs.length > 1,
        exportOptions,
        audioTrack: generalSettings.previewAudioStreamIndex,
          audioLanguage: generalSettings.previewAudioLanguage,
      });
      await deliverExportedFiles(exportedFiles);
    } catch (err) {
      const message = typeof err === "string"
        ? err
        : (err instanceof Error ? err.message : "Unknown error");
      console.error("Single clip download failed:", err);
      useAppStateStore.getState().setProgressMsg(`Export failed: ${message}`);
      setTimeout(() => {
        useAppStateStore.getState().setProgressMsg("");
      }, 8000);
    } finally {
      setLoading(false);
      setActiveOperation(null);
    }

  }, [buildExportOptionsPayload, generalSettings.exportFormat, generalSettings.exportProfiles, generalSettings.openFileLocationAfterExport, generalSettings.activeExportProfileId]);

  return {
    loading,
    importToken,
    setImportToken,
    batchTotal,
    batchDone,
    batchCurrentFile,
    onImportClick,
    handleImport,
    handleExport,
    handlePickExportDir,
    handleBatchImport,
    handleDownloadSingleClip,
  };
}

