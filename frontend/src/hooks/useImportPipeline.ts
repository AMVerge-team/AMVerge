import { useCallback, useRef, startTransition } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n";
import { EpisodeEntry } from "../types/domain";
import { fileNameFromPath, truncateFileName } from "../utils/episodeUtils";
import { buildEpisodeCacheId, logImportError } from "../features/import/manifest";
import {
  discardEpisodeCache,
  hasLanded,
  runImportPipeline as runEpisodeImport,
} from "../features/import/importPipeline";
import { queueReencode } from "../features/import/reencodeQueue";
import { claimProcess } from "../features/processes/singleProcess";
import { useAppStateStore } from "../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";
import { VIDEO_EXTENSIONS } from "../utils/videoExtensions";


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

  // a batch streams every episode but only the first one takes the view
  const runImportPipeline = useCallback(
    (file: string, episodeId: string, focusGrid = true) =>
      runEpisodeImport(file, episodeId, {
        focusGrid,
        folderId: episodeState.selectedFolderId,
        importMethod: generalSettings.importMethod,
        detection: generalSettings.sceneDetectionMethod,
        // the ✕ during the handoff stops everything, so nothing is queued after it
        onUncut: () => {
          if (!abortedRef.current) queueReencode(episodeId);
        },
      }),
    [generalSettings.sceneDetectionMethod, generalSettings.importMethod, abortedRef, episodeState.selectedFolderId]
  );

  const handleImport = useCallback(
    async (file: string | null) => {
      if (!file) return;
      // one long job at a time: asks to stop whatever runs, or keeps it and drops this import
      if (!(await claimProcess("import"))) return;

      const episodeId = buildEpisodeCacheId(file);
      const gen = ++importGenRef.current;
      abortedRef.current = false;
      console.info("[import] start", {
        mode: "single",
        file,
        episodePath: generalSettings.episodesPath,
      });

      try {
        const app = useAppStateStore.getState();
        app.setProgress(0);
        app.setProgressMsg(t("jobs:import.starting"));
        setActiveOperation("import");
        setLoading(true);
        app.setSelectedClips(new Set());
        app.setFocusedClip(null);
        app.setFocusedClipId(null);
        app.setImportedVideoPath(file);
        app.setVideoIsHEVC(null);
        setImportToken(Date.now().toString());

        const { episodeEntry, sceneCount } = await runImportPipeline(file, episodeId);

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
    [episodeState, generalSettings.episodesPath, abortedRef, runImportPipeline]
  );

  const handleBatchImport = useCallback(
    async (files: string[]) => {
      if (files.length === 0) return;
      if (!(await claimProcess("import"))) return;

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
        app.setProgressMsg(t("jobs:import.starting"));
        setActiveOperation("import");
        // batch shows the minimizable full loader; bgImportProgress lets closing the card abort the rest
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
          useAppStateStore.getState().setProgressMsg(t("jobs:import.starting"));
          useAppStateStore.setState({ bgProgress: null });
          console.info("[import] batch file begin", {
            index: i + 1,
            total: files.length,
            file,
            episodeId,
          });

          try {
            // each episode appears when its preview phase completes; only the first takes the grid
            const { episodeEntry, sceneCount } = await runImportPipeline(
              file,
              episodeId,
              completedEpisodes.length === 0
            );
            console.info("[import] manifest verified", {
              mode: "batch",
              episodeId,
              scenes: sceneCount,
            });

            if (abortedRef.current || importGenRef.current !== gen) {
              if (!hasLanded(episodeId)) discardEpisodeCache(episodeId);
              break;
            }

            completedEpisodes.push(episodeEntry);
            // replaces the entry the streaming listener inserted
            episodeState.setEpisodes((prev) => [
              episodeEntry,
              ...prev.filter((ep) => ep.id !== episodeEntry.id),
            ]);
            setBgImportProgress({ done: i + 1, total: files.length });

            // the first finished episode opens and the loader minimizes; later ones only fill the sidebar
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
            if (!(abortedRef.current && hasLanded(episodeId))) discardEpisodeCache(episodeId);
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

  // the picker comes first: a running job is only questioned once there is something to start
  const onImportClick = useCallback(async () => {
    try {
      const files = await open({
        multiple: true,
        filters: [{ name: t("jobs:dialog.videoFilter"), extensions: VIDEO_EXTENSIONS }],
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
