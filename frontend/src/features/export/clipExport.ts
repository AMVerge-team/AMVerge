/**
 * clipExport.ts
 *
 * Shared pieces of the export path: how an export profile becomes the payload
 * the Rust side expects, and how a single grid tile is saved to disk.
 *
 * Settings are read at call time via `getState()` rather than through hooks, so
 * a component can hand `downloadSingleClip` straight to a memoized tile without
 * subscribing to the settings store — subscribing there re-rendered the whole
 * grid whenever any unrelated setting changed.
 */
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { ClipItem } from "../../types/domain";
import { useAppStateStore } from "../../stores/appStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import {
  getRecommendedContainerForCodec,
  isExportCodecContainerCompatible,
} from "./profiles";

export type ExportOptionsPayload = {
  profileId: string;
  workflow: string;
  editorTarget: string;
  codec: string;
  audioMode: string;
  hardwareMode: string;
  parallelExports: number;
  audioStreamIndex?: number | null;
};

export function buildExportOptionsPayload(
  profileId: string
): ExportOptionsPayload | undefined {
  const settings = useGeneralSettingsStore.getState();
  const profile =
    settings.exportProfiles.find((candidate) => candidate.id === profileId)
    ?? settings.exportProfiles[0];
  if (!profile) return undefined;

  // Pass audioMode through as-is. The Rust backend now handles "copy" fallback
  // safely (probes source audio codec and switches to AAC/etc. when copy would
  // fail the muxer) and recognizes "none" as `-an`. Silently rewriting here
  // was hiding muxer-incompat failures and producing 0 KB outputs.
  let audioMode = profile.audioMode;
  if (profile.container === "mov" && audioMode === "flac") {
    // MOV + FLAC isn't natively supported; ALAC keeps lossless audio in a MOV-friendly format.
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
    audioStreamIndex: settings.previewAudioStreamIndex,
  };
}

/** Container the active profile should write, corrected when its codec can't be muxed into it. */
export function resolveExportFormat(profileId: string): string {
  const settings = useGeneralSettingsStore.getState();
  const profile =
    settings.exportProfiles.find((candidate) => candidate.id === profileId)
    ?? settings.exportProfiles[0];
  const preferred = profile?.container || "mp4";

  return profile
    && profile.workflow === "video_encode"
    && !isExportCodecContainerCompatible(profile.codec, preferred)
      ? getRecommendedContainerForCodec(profile.codec)
      : preferred;
}

/**
 * Save one grid tile to a user-chosen file.
 *
 * A tile that the import-time similar-scene pass folded together still points at
 * every source segment it swallowed, so it is exported as a merge of those
 * segments — that is what makes it one file instead of one per segment.
 */
export async function downloadSingleClip(clip: ClipItem): Promise<void> {
  const settings = useGeneralSettingsStore.getState();
  const appState = useAppStateStore.getState();
  const profileId = settings.activeExportProfileId;

  try {
    const format = resolveExportFormat(profileId);
    // Drop any extension before appending the target container's, otherwise the
    // dialog opens prefilled with "episode_0007.mp4.mp4".
    const fileName = (clip.originalName || clip.src.split(/[\\/]/).pop() || "clip")
      .replace(/\.[^./\\]+$/, "");

    const savePath = await save({
      defaultPath: `${fileName}.${format}`,
      filters: [{ name: "Video", extensions: [format] }],
    });
    if (!savePath) return;

    appState.setLoading(true);

    const srcs = clip.mergedSrcs ?? [clip.src];
    const exportedFiles = await invoke<string[]>("export_clips", {
      clips: srcs,
      savePath,
      mergeEnabled: srcs.length > 1,
      exportOptions: buildExportOptionsPayload(profileId),
    });

    if (settings.openFileLocationAfterExport && exportedFiles.length > 0) {
      await invoke("reveal_in_file_manager", { filePath: exportedFiles[0] });
    }
  } catch (err) {
    const message = typeof err === "string"
      ? err
      : (err instanceof Error ? err.message : "Unknown error");
    console.error("Single clip download failed:", err);
    appState.setProgressMsg(`Export failed: ${message}`);
    setTimeout(() => {
      useAppStateStore.getState().setProgressMsg("");
    }, 8000);
  } finally {
    appState.setLoading(false);
  }
}
