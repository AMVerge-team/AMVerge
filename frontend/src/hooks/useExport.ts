import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { message as showMessage, open, save } from "@tauri-apps/plugin-dialog";
import { ClipItem } from "../types/domain";
import { fileNameFromPath } from "../utils/episodeUtils";
import { runPostExportPasses, type PassTarget } from "../features/export/runPostExportPasses";
import {
  anyPassEnabled,
  PASS_SUFFIX,
  POST_EXPORT_PASS_KINDS,
  type PostExportPassKind,
  type PostExportPasses,
} from "../features/export/postPasses";
import { pickPassTargets, type PassClipPicks } from "../features/export/passTargets";
import { clipExportSpecs, separateExportNumbers } from "../features/export/clipSpecs";
import { deliverExportedFiles } from "../features/export/deliverExports";
import { claimProcess } from "../features/processes/singleProcess";
import { remuxAudioModeForSource, remuxContainerForSource, type ExportSourceStreams } from "../features/export/remuxPolicy";
import type { ExportAudioMode } from "../features/export/profileTypes";
import {
  buildExportOptionsPayload,
  errorMessage,
  findActiveProfile,
  pathSeparatorFor,
  resolveExportFormat,
  sanitizeExportBaseName,
  type ExportOptionsPayload,
} from "../features/export/exportOptions";
import { useAppStateStore, useAppPersistedStore } from "../stores/appStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";

const ERROR_MESSAGE_TIMEOUT_MS = 8000;

/** the clip id behind each export spec, in order: the cli returns one file per spec, in spec order */
function specOwners(clips: ClipItem[]): string[] {
  return clips.flatMap((c) => clipExportSpecs(c).map(() => c.id));
}

type Params = {
  onRPCUpdate?: (data: any) => void;
};

export function useExport({ onRPCUpdate }: Params) {
  const generalSettings = useGeneralSettingsStore();
  const persistedState = useAppPersistedStore();
  const setLoading = useAppStateStore((s) => s.setLoading);
  const setActiveOperation = useAppStateStore((s) => s.setActiveOperation);

  const rpcFinished = useCallback(() => {
    onRPCUpdate?.({
      type: "update",
      details: "Export Finished!",
      state: "Success",
      large_image: "amverge_logo",
      small_image: generalSettings.rpcShowMiniIcons ? "check_icon_new" : undefined,
      small_text: generalSettings.rpcShowMiniIcons ? "Done" : undefined,
    });
  }, [onRPCUpdate, generalSettings.rpcShowMiniIcons]);

  const reportFailure = useCallback(
    (err: unknown, logLabel: string, notifyRPC: boolean) => {
      const message = errorMessage(err);
      console.error(logLabel, err);
      useAppStateStore.getState().setProgressMsg(`Export failed: ${message}`);
      // the terminal closes in the caller's finally, so every failure gets a durable dialog
      void showMessage(message, { title: "Export failed", kind: "error" });
      if (notifyRPC) {
        onRPCUpdate?.({
          type: "update",
          details: "Export Failed",
          state: message.slice(0, 120),
          large_image: "amverge_logo",
          small_image: generalSettings.rpcShowMiniIcons ? "edit_icon_new" : undefined,
          small_text: generalSettings.rpcShowMiniIcons ? "Error" : undefined,
        });
      }
      setTimeout(() => {
        useAppStateStore.getState().setProgressMsg("");
      }, ERROR_MESSAGE_TIMEOUT_MS);
    },
    [onRPCUpdate, generalSettings.rpcShowMiniIcons]
  );

  // profile-derived values every export path needs
  const exportContext = useCallback(() => {
    const profileId = generalSettings.activeExportProfileId;
    const activeProfile = findActiveProfile(generalSettings.exportProfiles, profileId);
    return {
      exportOptions: buildExportOptionsPayload(generalSettings.exportProfiles, profileId),
      format: resolveExportFormat(activeProfile),
    };
  }, [generalSettings.exportProfiles, generalSettings.activeExportProfileId]);

  const exportContextForClips = useCallback(async (clips: ClipItem[]) => {
    const context = exportContext();
    const options = context.exportOptions;
    if (!options || options.workflow !== "video_remux") return context;

    const sourcePath = clips.flatMap(clipExportSpecs)[0]?.input;
    if (!sourcePath) return context;
    let source: ExportSourceStreams = { videoCodec: null, audioCodecs: [] };
    try {
      source = await invoke<ExportSourceStreams>("probe_export_source_streams", { videoPath: sourcePath });
    } catch (error) {
      // falls back to MP4; the cli's preflight explains anything it can't copy
      console.warn("Could not inspect remux source streams", error);
    }
    const container = remuxContainerForSource(sourcePath, source.videoCodec);
    return {
      format: container,
      exportOptions: {
        ...options,
        audioMode: remuxAudioModeForSource(options.audioMode as ExportAudioMode, container, source.audioCodecs),
      },
    };
  }, [exportContext]);

  const runExportClips = useCallback(
    (clips: unknown[], savePath: string, mergeEnabled: boolean, exportOptions?: ExportOptionsPayload) =>
      invoke<string[]>("export_clips", {
        clips,
        savePath,
        mergeEnabled,
        exportOptions,
        audioTrack: generalSettings.previewAudioStreamIndex,
        audioLanguage: generalSettings.previewAudioLanguage,
      }),
    [generalSettings.previewAudioStreamIndex, generalSettings.previewAudioLanguage]
  );

  // never overwrite: an existing merged file (or one of its pass outputs) bumps the name to "name (1)", "name (2)", ...
  const mergeBaseName = (selected: ClipItem[], dir: string, format: string, mergeFileName?: string) => {
    const stem = (selected[0]?.originalName || "episode").replace(/\.[^./\\]+$/, "");
    return invoke<string>("unique_export_base_name", {
      dir,
      base: sanitizeExportBaseName(mergeFileName || `${stem}_merged`),
      extension: format,
      suffixes: Object.values(PASS_SUFFIX),
    });
  };

  /** merge with a pass on only some clips: the full merge as usual, that pass on its own staged merge of the picks */
  const exportMergedWithPasses = useCallback(
    async (
      selected: ClipItem[],
      dir: string,
      mergeFileName: string | undefined,
      passes: PostExportPasses,
      picks: PassClipPicks
    ) => {
      const sep = pathSeparatorFor(dir);
      const { exportOptions, format } = await exportContextForClips(selected);
      const baseName = await mergeBaseName(selected, dir, format, mergeFileName);
      const finalSavePath = `${dir}${sep}${baseName}.${format}`;

      // partial pass sources are staged elsewhere, so the picked folder only receives merged results
      const stagingDir = await invoke<string>("create_export_staging_dir");
      const stagingSep = pathSeparatorFor(stagingDir);

      let mergedFiles: string[] = [];

      // one loading span across phases, or the terminal remounts and loses its log
      useAppStateStore.setState({ exportMerges: true });
      setActiveOperation("export");
      setLoading(true);

      try {
        // both go through the cli's merge, which keeps the profile's codec and fits mixed sizes with black bars
        mergedFiles = await runExportClips(selected.flatMap(clipExportSpecs), finalSavePath, true, exportOptions);
        if (mergedFiles.length === 0) throw new Error("Export produced no files.");

        const covers = (kind: PostExportPassKind) => picks[kind].size === selected.length;
        const targets: PassTarget[] = [];
        // a pass covering every clip just uses the full merge
        if (POST_EXPORT_PASS_KINDS.some(covers)) {
          targets.push({ path: mergedFiles[0], depth: covers("depth"), upscale: covers("upscale") });
        }
        for (const kind of POST_EXPORT_PASS_KINDS) {
          if (picks[kind].size === 0 || covers(kind)) continue;
          const [source] = await runExportClips(
            selected.filter((clip) => picks[kind].has(clip.id)).flatMap(clipExportSpecs),
            `${stagingDir}${stagingSep}${baseName}_${kind}.${format}`,
            true,
            exportOptions
          );
          targets.push({
            path: source,
            depth: kind === "depth",
            upscale: kind === "upscale",
            outputStem: `${dir}${sep}${baseName}`,
          });
        }

        // the staging folder goes in the finally below, so passes run here, inside the export's loading span
        await runPostExportPasses(targets, passes);

        await deliverExportedFiles(mergedFiles);
        rpcFinished();
      } catch (err) {
        reportFailure(err, "Export failed:", true);
      } finally {
        setLoading(false);
        setActiveOperation(null);
        // the staging folder always goes; merged outputs went straight to the user's folder
        try {
          await invoke("delete_export_staging_dir", { dir: stagingDir });
        } catch (err) {
          console.warn("Failed to remove export staging folder:", err);
        }
      }
    },
    [exportContext, runExportClips, rpcFinished, reportFailure, setActiveOperation, setLoading]
  );

  const handleExport = useCallback(
    async (selectedClips: Set<string>, mergeEnabled: boolean, mergeFileName?: string) => {
      if (selectedClips.size === 0) return;
      const selected = useAppStateStore
        .getState()
        .clips.filter((c: ClipItem) => selectedClips.has(c.id));
      if (selected.length === 0) return;

      let dir = persistedState.exportDir;
      if (!dir) {
        const picked = await open({ directory: true, multiple: false });
        if (!picked) return;
        dir = picked as string;
        persistedState.setExportDir(dir);
      }

      const passesSnapshot = generalSettings.postExportPasses;
      // which selected clips get each pass; cancelling drops the export
      const picks = await pickPassTargets(selected, passesSnapshot, mergeEnabled);
      if (!picks) return;

      // one long job at a time: asks to stop whatever runs, or keeps it and drops this export
      if (!(await claimProcess("export"))) return;

      // a direct merge only fits when each pass (if any) covers every clip
      const partialPass = POST_EXPORT_PASS_KINDS.some(
        (kind) => picks[kind].size > 0 && picks[kind].size < selected.length
      );
      if (mergeEnabled && partialPass) {
        await exportMergedWithPasses(selected, dir, mergeFileName, passesSnapshot, picks);
        return;
      }

      // fed to the passes once the export loader closes; empty on failure so no passes run
      let producedFiles: string[] = [];

      try {
        useAppStateStore.setState({ exportMerges: mergeEnabled });
        setActiveOperation("export");
        setLoading(true);
        const sep = pathSeparatorFor(dir);
        const { exportOptions, format } = await exportContextForClips(selected);
        let clipArray = selected.flatMap(clipExportSpecs);

        let savePath: string;
        if (mergeEnabled) {
          savePath = `${dir}${sep}${await mergeBaseName(selected, dir, format, mergeFileName)}.${format}`;
        } else {
          const firstFile = (selected[0]?.src || "").split(/[/\\]/).pop() || `episode_0000.${format}`;
          const defaultBase = firstFile.replace(/\.[^/.]+$/, "").replace(/_\d{4}$/, "");
          const numbers = separateExportNumbers(selected);
          clipArray = clipArray.map((spec, i) => ({ ...spec, scene_index: numbers[i] }));
          // never overwrite: any of these files (or their pass outputs) existing bumps the name to "name (1)", ...
          const tails = numbers.map((n) => `_${String(n).padStart(4, "0")}`);
          const base = await invoke<string>("unique_export_base_name", {
            dir,
            base: sanitizeExportBaseName(defaultBase),
            extension: format,
            suffixes: tails.flatMap((tail) => [tail, ...Object.values(PASS_SUFFIX).map((pass) => `${tail}${pass}`)]),
          });
          savePath = `${dir}${sep}${base}_####.${format}`;
        }

        producedFiles = await runExportClips(clipArray, savePath, mergeEnabled, exportOptions);
        await deliverExportedFiles(producedFiles);
        rpcFinished();
      } catch (err) {
        reportFailure(err, "Export failed:", true);
      } finally {
        setLoading(false);
        setActiveOperation(null);
      }

      // the export loader is closed now, and the passes modal drives itself
      if (producedFiles.length > 0 && anyPassEnabled(passesSnapshot)) {
        const owners = mergeEnabled ? [] : specOwners(selected);
        const targets: PassTarget[] = producedFiles.map((path, i) =>
          mergeEnabled
            ? { path, depth: picks.depth.size > 0, upscale: picks.upscale.size > 0 }
            : {
                path,
                depth: picks.depth.has(owners[i] ?? ""),
                upscale: picks.upscale.has(owners[i] ?? ""),
              }
        );
        void runPostExportPasses(targets, passesSnapshot);
      }
    },
    [
      persistedState,
      generalSettings.postExportPasses,
      exportMergedWithPasses,
      exportContextForClips,
      runExportClips,
      rpcFinished,
      reportFailure,
      setActiveOperation,
      setLoading,
    ]
  );

  const handlePickExportDir = useCallback(async () => {
    // opens where the last export went, which Tools' exports update too
    const dir = await open({ directory: true, multiple: false, defaultPath: persistedState.exportDir ?? undefined });
    if (dir) persistedState.setExportDir(dir as string);
  }, [persistedState]);

  const handleDownloadSingleClip = useCallback(
    async (clip: ClipItem) => {
      try {
        const { exportOptions, format } = await exportContextForClips([clip]);
        const fileName = (clip.originalName || fileNameFromPath(clip.src)).replace(/\.[^./\\]+$/, "");
        const savePath = await save({
          defaultPath: `${fileName}.${format}`,
          filters: [{ name: "Video", extensions: [format] }],
        });
        if (!savePath) return;

        const srcs = clipExportSpecs(clip);
        useAppStateStore.setState({ exportMerges: srcs.length > 1 });
        setActiveOperation("export");
        setLoading(true);

        const exportedFiles = await runExportClips(srcs, savePath, srcs.length > 1, exportOptions);
        await deliverExportedFiles(exportedFiles);
      } catch (err) {
        reportFailure(err, "Single clip download failed:", false);
      } finally {
        setLoading(false);
        setActiveOperation(null);
      }
    },
    [exportContextForClips, runExportClips, reportFailure, setActiveOperation, setLoading]
  );

  return { handleExport, handlePickExportDir, handleDownloadSingleClip };
}
