import { invoke } from "@tauri-apps/api/core";
import { t } from "../../i18n";
import type { EpisodeEntry } from "../../types/domain";
import { fileNameFromPath, loadEpisodeManifest } from "../../utils/episodeUtils";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { useGeneralSettingsStore, type SceneDetectionMethod } from "../../stores/settingsStore";
import { parseManifestInitialClips } from "./manifest";
import { startVideoStreamingListeners } from "./streamListeners";

export type ImportOptions = {
  /** whether the episode takes the grid as its scenes land */
  focusGrid: boolean;
  folderId: string | null;
  importMethod: NonNullable<EpisodeEntry["importMethod"]>;
  detection: SceneDetectionMethod;
  /** keep pre-computed .npy scene detection cache files in the episode folder */
  preserveSceneCache?: boolean;
  /** the preview phase ended with clips still uncut (ai re-encodes); the cli is already stopped */
  onUncut: () => void;
};

export type ImportResult = { episodeEntry: EpisodeEntry; sceneCount: number };

/** set by the progress window's ✕ (App's abort); every import reads this one flag, whichever button started it */
export const importAbortRef: { current: boolean } = { current: false };

/** what `detect_scenes` rejects with when its import was stopped (rust scenes.rs) */
export const DETECT_CANCELED = "Scene detection was canceled.";

/** detects and cuts one episode; video mode resolves after the preview phase and hands uncut clips to `onUncut` */
export async function runImportPipeline(file: string, episodeId: string, options: ImportOptions): Promise<ImportResult> {
  const { focusGrid, folderId, importMethod, detection, preserveSceneCache, onUncut } = options;
  const episodesPath = useGeneralSettingsStore.getState().episodesPath;

  // the ml pack may be gone since it was chosen, so prompt now instead of failing mid-import
  if (detection === "transnetv2_gpu" && !(await useAiDepsStore.getState().ensurePack("ml"))) {
    throw new Error(t("jobs:import.transnetMissing"));
  }

  const detectScenes = () =>
    invoke("detect_scenes", {
      videoPath: file,
      episodeCacheId: episodeId,
      customPath: episodesPath,
      sceneDetectionMethod: detection,
      importMethod,
      preserveSceneCache: Boolean(preserveSceneCache),
    });

  const entry = (clips: EpisodeEntry["clips"], method: ImportOptions["importMethod"]): EpisodeEntry => ({
    id: episodeId,
    displayName: clips[0]?.originalName || fileNameFromPath(file),
    videoPath: file,
    folderId,
    importedAt: Date.now(),
    clips,
    importMethod: method,
  });

  if (importMethod === "video_files") {
    const episodes = useEpisodePanelRuntimeStore.getState();
    // events carry their episode id, so an earlier import's phase 2 keeps patching its own episode
    const { stop, phase1Done, getClips } = await startVideoStreamingListeners(file, episodeId, focusGrid, {
      selectedFolderId: folderId,
      importMethod,
      setEpisodes: episodes.setEpisodes,
      setSelectedEpisodeId: episodes.setSelectedEpisodeId,
      setOpenedEpisodeId: episodes.setOpenedEpisodeId,
    });

    // detection isn't awaited: phase 2 runs on after phase1_complete, listeners stop when the process ends
    let invokeError: unknown = null;
    const invokeSettled = detectScenes()
      .catch((err) => {
        invokeError = err;
      })
      .finally(stop);

    // whichever first: phase 1 done, or the process ending before it
    const winner = await Promise.race([
      phase1Done.then(() => "phase1" as const),
      invokeSettled.then(() => "invoke" as const),
    ]);

    if (winner === "phase1") {
      // uncut clips are re-encodes: stop this cli and let a queue finish them
      if (getClips().some((clip) => !clip.clipPath)) {
        await invoke("abort_detect_scenes", { episodeCacheId: episodeId }).catch(() => {});
        await invokeSettled;
        onUncut();
      }
      // read from the session, not the grid: a background episode never wrote there
      const streamedClips = getClips();
      return { episodeEntry: entry(streamedClips, "video_files"), sceneCount: streamedClips.length };
    }

    if (invokeError) throw invokeError;
    // no scenes and no phase-1 signal: fall through to manifest hydration
  } else {
    // non-streaming imports run detection to completion so the manifest exists
    await detectScenes();
  }

  const manifest = await loadEpisodeManifest(episodeId, episodesPath);
  const clips = parseManifestInitialClips(manifest, episodeId);
  if (clips.length === 0) throw new Error("Manifest import path produced no clips.");

  const manifestMethod = manifest?.source?.importMethod;
  return {
    episodeEntry: entry(
      clips,
      manifestMethod === "webp_files" || manifestMethod === "video_files" ? manifestMethod : importMethod
    ),
    sceneCount: Array.isArray(manifest?.scenes) ? manifest.scenes.length : clips.length,
  };
}

/** deletes an import's cache folder, for a failed or canceled import that never landed */
export function discardEpisodeCache(episodeId: string) {
  invoke("delete_episode_cache", {
    episodeCacheId: episodeId,
    customPath: useGeneralSettingsStore.getState().episodesPath,
  }).catch(() => {});
}

/** whether an import's scenes already reached the sidebar, so a stopped one is kept as paused */
export function hasLanded(episodeId: string): boolean {
  return useEpisodePanelRuntimeStore.getState().episodes.some((ep) => ep.id === episodeId && ep.clips.length > 0);
}
