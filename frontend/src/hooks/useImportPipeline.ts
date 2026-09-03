import { useCallback, useRef, startTransition } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { EpisodeEntry } from "../types/domain";
import { fileNameFromPath, truncateFileName, loadEpisodeManifest } from "../utils/episodeUtils";
import {
  buildEpisodeCacheId,
  logImportError,
  parseManifestInitialClips,
} from "../features/import/manifest";
import { startVideoStreamingListeners } from "../features/import/streamListeners";
import { useAiDepsStore } from "../stores/aiDepsStore";
import { useAppStateStore } from "../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "avi"];

type Params = {
  abortedRef: React.RefObject<boolean>;
};

export function useImportPipeline({ abortedRef }: Params) {
  const episodeState = useEpisodePanelRuntimeStore();
  const generalSettings = useGeneralSettingsStore();

  const setLoading = useAppStateStore((s) => s.setLoading);
  const setActiveOperation = useAppStateStore((s) => s.setActiveOperation);
  const setBgImportProgress = useAppStateStore((s) => s.setBgImportProgress);
  const setImportToken = useAppStateStore((s) => s.setImportToken);
  const setBatchTotal = useAppStateStore((s) => s.setBatchTotal);
  const setBatchDone = useAppStateStore((s) => s.setBatchDone);
  const setBatchCurrentFile = useAppStateStore((s) => s.setBatchCurrentFile);

  // bumped per import so a stale run cannot clear the loader of a newer one
  const importGenRef = useRef(0);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const importBusy = () => {
    const s = useAppStateStore.getState();
    return Boolean(s.loading || s.bgProgress || s.bgImportProgress);
  };

  const discardEpisodeCache = (episodeId: string) => {
    invoke("delete_episode_cache", {
      episodeCacheId: episodeId,
      customPath: generalSettings.episodesPath,
    }).catch(() => {});
  };

  const runImportPipeline = useCallback(
    async (
      file: string,
      episodeId: string,
      streamToGrid = false,
      // a batch streams every episode but only the first one takes the view
      focusGrid = streamToGrid
    ): Promise<{ episodeEntry: EpisodeEntry; sceneCount: number }> => {
      // video mode streams clips into the grid as they are cut and resolves once
      // the keyframe copies land; re-encodes finish in the background
      const videoStreaming = streamToGrid && generalSettings.importMethod === "video_files";

      // the ml pack could have been removed, or the setting carried over from an
      // older install, since it was chosen. prompt here rather than letting the
      // backend fail mid-import
      if (generalSettings.sceneDetectionMethod === "transnetv2_gpu") {
        const ready = await useAiDepsStore.getState().ensurePack("ml");
        if (!ready) {
          throw new Error(
            "TransNetV2 is not installed. Install it, or switch scene detection to Keyframe Detection in Settings."
          );
        }
      }

      const detectScenes = () =>
        invoke("detect_scenes", {
          videoPath: file,
          episodeCacheId: episodeId,
          customPath: generalSettings.episodesPath,
          sceneDetectionMethod: generalSettings.sceneDetectionMethod,
          importMethod: generalSettings.importMethod,
        });

      if (videoStreaming) {
        // sessions no longer tear each other down: every event carries its
        // episode id, so an earlier import's phase-2 keeps patching its own
        // episode while this one starts
        const { stop, phase1Done, getClips } = await startVideoStreamingListeners(
          file,
          episodeId,
          focusGrid,
          {
            selectedFolderId: episodeState.selectedFolderId,
            importMethod: generalSettings.importMethod,
            setEpisodes: episodeState.setEpisodes,
            setSelectedEpisodeId: episodeState.setSelectedEpisodeId,
            setOpenedEpisodeId: episodeState.setOpenedEpisodeId,
          }
        );
        const previousCleanup = streamCleanupRef.current;
        streamCleanupRef.current = () => {
          previousCleanup?.();
          stop();
        };

        // fire detection but do not block import completion on it: the process
        // keeps running phase-2 after phase1_complete, and listeners come down
        // only when the whole process ends
        let invokeError: unknown = null;
        const invokeSettled = detectScenes()
          .catch((err) => {
            invokeError = err;
          })
          .finally(stop);

        // whichever comes first: phase-1 done, or the process ending before it
        // (an error, or a video that produced no scenes)
        const winner = await Promise.race([
          phase1Done.then(() => "phase1" as const),
          invokeSettled.then(() => "invoke" as const),
        ]);

        if (winner === "phase1") {
          // read from the session, not the grid: a background episode never
          // wrote there. phase-2 patches keep arriving afterwards
          const streamedClips = getClips();
          return {
            episodeEntry: {
              id: episodeId,
              displayName: streamedClips[0]?.originalName || fileNameFromPath(file),
              videoPath: file,
              folderId: episodeState.selectedFolderId,
              importedAt: Date.now(),
              clips: streamedClips,
              importMethod: "video_files",
            },
            sceneCount: streamedClips.length,
          };
        }

        if (invokeError) throw invokeError;
        // no scenes and no phase-1 signal: detection already ran, so fall through
        // to manifest hydration
      } else {
        // webp_files and any other non-streaming import: run detection to
        // completion here so the manifest exists for hydration below
        await detectScenes();
      }

      const manifest = await loadEpisodeManifest(episodeId, generalSettings.episodesPath);
      const clips = parseManifestInitialClips(manifest, episodeId);
      if (clips.length === 0) throw new Error("Manifest import path produced no clips.");

      const manifestMethod = manifest?.source?.importMethod;
      return {
        episodeEntry: {
          id: episodeId,
          displayName: clips[0]?.originalName || fileNameFromPath(file),
          videoPath: file,
          folderId: episodeState.selectedFolderId,
          importedAt: Date.now(),
          clips,
          importMethod:
            manifestMethod === "webp_files" || manifestMethod === "video_files"
              ? manifestMethod
              : generalSettings.importMethod,
        },
        sceneCount: Array.isArray(manifest?.scenes) ? manifest.scenes.length : clips.length,
      };
    },
    [
      generalSettings.episodesPath,
      generalSettings.sceneDetectionMethod,
      generalSettings.importMethod,
      episodeState.selectedFolderId,
      episodeState.setEpisodes,
      episodeState.setSelectedEpisodeId,
      episodeState.setOpenedEpisodeId,
    ]
  );

  const handleImport = useCallback(
    async (file: string | null) => {
      if (!file || importBusy()) return;

      const episodeId = buildEpisodeCacheId(file);
      const gen = ++importGenRef.current;
      console.info("[import] start", {
        mode: "single",
        file,
        episodePath: generalSettings.episodesPath,
      });

      try {
        const app = useAppStateStore.getState();
        app.setProgress(0);
        app.setProgressMsg("Starting...");
        setActiveOperation("import");
        setLoading(true);
        app.setSelectedClips(new Set());
        app.setFocusedClip(null);
        app.setFocusedClipId(null);
        app.setImportedVideoPath(file);
        app.setVideoIsHEVC(null);
        setImportToken(Date.now().toString());

        const { episodeEntry, sceneCount } = await runImportPipeline(file, episodeId, true);

        // replace, not duplicate, the entry the streaming listener may have added
        episodeState.setEpisodes((prev) => [
          episodeEntry,
          ...prev.filter((ep) => ep.id !== episodeId),
        ]);
        episodeState.setSelectedEpisodeId(episodeId);
        episodeState.setOpenedEpisodeId(episodeId);
        useAppStateStore.setState({ clips: episodeEntry.clips });

        console.info("[import] detect_scenes completed", {
          mode: "single",
          episodeId,
          clips: episodeEntry.clips.length,
          scenes: sceneCount,
        });
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
    },
    [episodeState, generalSettings.episodesPath, runImportPipeline]
  );

  const handleBatchImport = useCallback(
    async (files: string[]) => {
      if (files.length === 0 || importBusy()) return;

      const gen = ++importGenRef.current;
      abortedRef.current = false;
      const completedEpisodes: EpisodeEntry[] = [];
      console.info("[import] start", {
        mode: "batch",
        files: files.length,
        episodePath: generalSettings.episodesPath,
      });

      try {
        const app = useAppStateStore.getState();
        app.setProgress(0);
        app.setProgressMsg("Starting...");
        setActiveOperation("import");
        // batch shows the full loading screen, which is minimizable.
        // bgImportProgress is still tracked so closing the minimized card aborts
        // the remaining episodes
        setLoading(true);
        app.setSelectedClips(new Set());
        app.setFocusedClip(null);
        app.setFocusedClipId(null);
        app.setVideoIsHEVC(null);
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
            // stream every episode so it appears as soon as its keyframe cuts
            // land. only the first takes the grid; the rest fill the sidebar
            // without moving the user's view
            const { episodeEntry, sceneCount } = await runImportPipeline(
              file,
              episodeId,
              true,
              completedEpisodes.length === 0
            );
            console.info("[import] manifest verified", {
              mode: "batch",
              episodeId,
              scenes: sceneCount,
            });

            if (abortedRef.current || importGenRef.current !== gen) {
              discardEpisodeCache(episodeId);
              break;
            }

            completedEpisodes.push(episodeEntry);
            // the streaming listener already inserted this episode when its
            // scenes were detected, so replace that entry
            episodeState.setEpisodes((prev) => [
              episodeEntry,
              ...prev.filter((ep) => ep.id !== episodeEntry.id),
            ]);
            setBgImportProgress({ done: i + 1, total: files.length });

            // first finished episode: open it and drop the full-screen loader,
            // which auto-minimizes to the batch card since bgImportProgress is
            // still active. later episodes only stream into the sidebar so the
            // user's view is never yanked
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
              episodeId,
              clips: episodeEntry.clips.length,
            });
          } catch (err) {
            discardEpisodeCache(episodeId);
            if (abortedRef.current) break;
            logImportError("batch.detect_scenes", err, {
              index: i + 1,
              total: files.length,
              file,
              fileName,
              episodeId,
              episodePath: generalSettings.episodesPath,
            });
            setBgImportProgress({ done: i + 1, total: files.length });
          }
        }
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
    },
    [episodeState, generalSettings.episodesPath, abortedRef, setBgImportProgress, runImportPipeline]
  );

  const onImportClick = useCallback(async () => {
    if (importBusy()) return;

    try {
      const files = await open({
        multiple: true,
        filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
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

      if (fileList.length === 1) await handleImport(fileList[0]);
      else await handleBatchImport(fileList);
    } catch (err) {
      logImportError("picker.open", err);
    }
  }, [handleImport, handleBatchImport]);

  return { onImportClick, handleImport, handleBatchImport };
}
