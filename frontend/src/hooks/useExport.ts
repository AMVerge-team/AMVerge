import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ClipItem } from "../types/domain";
import { fileNameFromPath } from "../utils/episodeUtils";
import { runPostExportPasses } from "../features/export/runPostExportPasses";
import { anyPassEnabled, PASS_SUFFIX, type PostExportPasses } from "../features/export/postPasses";
import { clipExportSpecs } from "../features/export/clipSpecs";
import { deliverExportedFiles } from "../features/export/deliverExports";
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

  const mergeBaseName = (selected: ClipItem[], mergeFileName?: string) => {
    const stem = (selected[0]?.originalName || "episode").replace(/\.[^./\\]+$/, "");
    return sanitizeExportBaseName(mergeFileName || `${stem}_merged`);
  };

  /**
   * merge plus interpolation. interpolation has to run per clip, before the
   * merge, so it never synthesizes frames across a cut boundary; the merged
   * timeline is then rebuilt from the interpolated clips.
   */
  const exportMergedWithInterpolation = useCallback(
    async (selected: ClipItem[], dir: string, mergeFileName: string | undefined, passes: PostExportPasses) => {
      const sep = pathSeparatorFor(dir);
      const { exportOptions, format } = exportContext();
      const baseName = mergeBaseName(selected, mergeFileName);
      const finalSavePath = `${dir}${sep}${baseName}.${format}`;

      // per-clip parts are staged elsewhere so the folder the user picked only
      // ever receives merged results, and a pass that fails midway leaves it
      // untouched
      const stagingDir = await invoke<string>("create_export_staging_dir");
      const stagingSep = pathSeparatorFor(stagingDir);

      const remuxOptions: ExportOptionsPayload = {
        profileId: exportOptions?.profileId ?? "",
        workflow: "video_remux",
        editorTarget: "none",
        codec: "copy",
        audioMode: "copy",
        hardwareMode: "cpu",
        parallelExports: 1,
      };
      const mergeInto = (inputs: string[], savePath: string) =>
        invoke<string[]>("export_clips", {
          clips: inputs.map((input) => ({ input })),
          savePath,
          mergeEnabled: true,
          exportOptions: remuxOptions,
        });

      let mergedFiles: string[] = [];

      // one loading span across every phase: toggling it per phase unmounted the
      // import terminal in between, throwing away the log lines it had collected
      setActiveOperation("export");
      setLoading(true);

      try {
        const clipFiles = await runExportClips(
          selected.flatMap(clipExportSpecs),
          `${stagingDir}${stagingSep}${baseName}_####.${format}`,
          false,
          exportOptions
        );
        if (clipFiles.length === 0) throw new Error("Export produced no files.");

        // the plain merge keeps the name the user chose, and passes never
        // overwrite it
        mergedFiles = await mergeInto(clipFiles, finalSavePath);

        // interpolation and dead-frames both produce per-clip copies, so each
        // merges into its own suffixed file and both versions survive
        const interpOnly: PostExportPasses = {
          ...passes,
          depth: { ...passes.depth, enabled: false },
        };
        const passOutputs = await runPostExportPasses(clipFiles, interpOnly);
        if (passOutputs.interpolated.length > 0) {
          await mergeInto(
            passOutputs.interpolated,
            `${dir}${sep}${baseName}${PASS_SUFFIX.interpolation}.${format}`
          );
        }
        if (passOutputs.deadframes.length > 0) {
          await mergeInto(
            passOutputs.deadframes,
            `${dir}${sep}${baseName}${PASS_SUFFIX.deadframes}.${format}`
          );
        }

        await deliverExportedFiles(mergedFiles);
        rpcFinished();
      } catch (err) {
        reportFailure(err, "Export failed:", true);
        return;
      } finally {
        setLoading(false);
        setActiveOperation(null);
        // the whole staging folder goes whatever happened: nothing in it was a
        // deliverable, and merged outputs went straight to the user's folder
        try {
          await invoke("delete_export_staging_dir", { dir: stagingDir });
        } catch (err) {
          console.warn("Failed to remove export staging folder:", err);
        }
      }

      // remaining passes run on the merged file
      const passesForMerged: PostExportPasses = {
        ...passes,
        interpolation: { ...passes.interpolation, enabled: false },
      };
      if (mergedFiles.length > 0 && anyPassEnabled(passesForMerged)) {
        void runPostExportPasses(mergedFiles, passesForMerged);
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

      if (mergeEnabled && passesSnapshot.interpolation.enabled) {
        await exportMergedWithInterpolation(selected, dir, mergeFileName, passesSnapshot);
        return;
      }

      // files the export produced, fed to the post-export passes once the export
      // loader closes. stays empty on failure so no passes run
      let producedFiles: string[] = [];

      try {
        setActiveOperation("export");
        setLoading(true);
        const sep = pathSeparatorFor(dir);
        const { exportOptions, format } = exportContext();
        const clipArray = selected.flatMap(clipExportSpecs);

        let savePath: string;
        if (mergeEnabled) {
          savePath = `${dir}${sep}${mergeBaseName(selected, mergeFileName)}.${format}`;
        } else {
          const firstFile = (selected[0]?.src || "").split(/[/\\]/).pop() || `episode_0000.${format}`;
          const defaultBase = firstFile.replace(/\.[^/.]+$/, "").replace(/_\d{4}$/, "");
          savePath = `${dir}${sep}${defaultBase}_####.${format}`;
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
        void runPostExportPasses(producedFiles, passesSnapshot);
      }
    },
    [
      persistedState,
      generalSettings.postExportPasses,
      exportMergedWithInterpolation,
      exportContext,
      runExportClips,
      rpcFinished,
      reportFailure,
      setActiveOperation,
      setLoading,
    ]
  );

  const handlePickExportDir = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir) persistedState.setExportDir(dir as string);
  }, [persistedState]);

  const handleDownloadSingleClip = useCallback(
    async (clip: ClipItem) => {
      try {
        const { exportOptions, format } = exportContext();
        const fileName = (clip.originalName || fileNameFromPath(clip.src)).replace(/\.[^./\\]+$/, "");
        const savePath = await save({
          defaultPath: `${fileName}.${format}`,
          filters: [{ name: "Video", extensions: [format] }],
        });
        if (!savePath) return;

        setActiveOperation("export");
        setLoading(true);

        const srcs = clipExportSpecs(clip);
        const exportedFiles = await runExportClips(srcs, savePath, srcs.length > 1, exportOptions);
        await deliverExportedFiles(exportedFiles);
      } catch (err) {
        reportFailure(err, "Single clip download failed:", false);
      } finally {
        setLoading(false);
        setActiveOperation(null);
      }
    },
    [exportContext, runExportClips, reportFailure, setActiveOperation, setLoading]
  );

  return { handleExport, handlePickExportDir, handleDownloadSingleClip };
}
