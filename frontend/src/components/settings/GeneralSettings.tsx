import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  importMethod,
  PreviewTranscodeMode,
  PreviewTranscodeQuality,
  SceneDetectionMethod,
  useGeneralSettingsStore,
} from "../../stores/settingsStore";
import { useAppStateStore } from "../../stores/appStore";
import { useUIStateStore } from "../../stores/UIStore";
import { useEffect, useMemo, useState} from "react";
import SettingRow from "../common/SettingRow";
import Dropdown, { type DropdownOption } from "../common/Dropdown";
import { clearEpisodePanelCache } from "../../utils/episodeUtils";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import {
  AI_PACKS,
  estimateDownloadMb,
  formatSizeMb,
  isPackInstalled,
} from "../../features/aiDeps/packs";

const SCENE_DETECTION_OPTIONS: DropdownOption<SceneDetectionMethod>[] = [
  {
    value: "transnetv2_gpu",
    label: "TransNetV2 (GPU)",
    description: "AI shot detection — most accurate scene boundaries.",
    // Marked as needing an install below when the ml pack is missing.
  },
  {
    value: "keyframe_detection",
    label: "Keyframe Detection",
    description: "Fast CPU cuts at I-frame boundaries (no GPU needed)",
  },
  {
    value: "pyscenedetect_cpu",
    label: "PySceneDetect (CPU)",
    description: "Not implemented yet.",
  },
];

const PREVIEW_METHOD_OPTIONS: DropdownOption<importMethod>[] = [
  {
    value: "video_files",
    label: "Video Files",
    description: "Cut clips per scene, and display the videos.",
  },
  {
    value: "webp_files",
    label: "WebP Files",
    description: "Animated WebP previews generated from the source (faster).",
  },
];

const PREVIEW_TRANSCODE_MODE_OPTIONS: DropdownOption<PreviewTranscodeMode>[] = [
  {
    value: "off",
    label: "Off",
    description: "Play clips as-is. Requires HEVC support on this PC.",
  },
  {
    value: "hevc",
    label: "HEVC Only",
    description: "Re-encode previews only when the source is HEVC/H.265.",
  },
  {
    value: "always",
    label: "Always",
    description: "Re-encode every preview, whatever the source codec is.",
  },
];

const PREVIEW_TRANSCODE_QUALITY_OPTIONS: DropdownOption<PreviewTranscodeQuality>[] = [
  { value: "360p", label: "360p", description: "Smallest and fastest to generate." },
  { value: "480p", label: "480p", description: "Balanced." },
  { value: "720p", label: "720p", description: "Sharper previews, slower to generate." },
  { value: "1080p", label: "1080p", description: "Full detail. Slowest, largest cache." },
];

type GeneralSettingsProps = {
  onGeneralSettingsReset: () => void;
  onEpisodesPathChanged: (oldPath: string, newPath: string) => void;
};

export default function GeneralSettings({
  onGeneralSettingsReset,
  onEpisodesPathChanged,
}: GeneralSettingsProps) {
  const generalSettings = useGeneralSettingsStore();
  const setGeneralSettings = useGeneralSettingsStore.setState;
  const setSceneDetectionMethod = useGeneralSettingsStore((s) => s.setSceneDetectionMethod);
  const setImportMethod = useGeneralSettingsStore((s) => s.setImportMethod);
  const setPreviewTranscodeMode = useGeneralSettingsStore((s) => s.setPreviewTranscodeMode);
  const setPreviewTranscodeQuality = useGeneralSettingsStore((s) => s.setPreviewTranscodeQuality);
  const userHasHEVC = useAppStateStore((s) => s.userHasHEVC);
  const hevcForced = !userHasHEVC;
  const effectivePreviewTranscodeMode: PreviewTranscodeMode =
    hevcForced && generalSettings.previewTranscodeMode === "off"
      ? "hevc"
      : generalSettings.previewTranscodeMode;
  const setGridPreview = useUIStateStore((s) => s.setGridPreview);
  const scenepacksCount = useScenepacksStore((s) => s.scenepacks.length);
  const [loading, setLoading] = useState(false);
  const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false);
  const [showClearPanelConfirm, setShowClearPanelConfirm] = useState(false);
  const [clearingPanel, setClearingPanel] = useState(false);
  const [showClearScenepacksConfirm, setShowClearScenepacksConfirm] = useState(false);
  const [clearingScenepacks, setClearingScenepacks] = useState(false);
  const [showDisableScenepacksConfirm, setShowDisableScenepacksConfirm] = useState(false);
  const factoryResetConfirmation =
    "This will restore AMVerge to its default settings and move your episode storage folder back to AppData. Any custom settings or storage location changes you made will be reset.";
  const clearPanelConfirmation =
    "This will remove ALL episodes from the Episode Panel and delete their cached files on disk. This cannot be undone.";
  const clearScenepacksConfirmation =
    "This will remove ALL Scenepacks and delete their materialized clip files on disk. This cannot be undone.";
  useEffect(() => {
    if (!showFactoryResetConfirm) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowFactoryResetConfirm(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFactoryResetConfirm]);

  useEffect(() => {
    if (!showClearPanelConfirm) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowClearPanelConfirm(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showClearPanelConfirm]);

  useEffect(() => {
    if (!showClearScenepacksConfirm) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowClearScenepacksConfirm(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showClearScenepacksConfirm]);

  useEffect(() => {
    if (!showDisableScenepacksConfirm) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDisableScenepacksConfirm(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showDisableScenepacksConfirm]);

  const handleClearEpisodePanel = async () => {
    setClearingPanel(true);
    try {
      await clearEpisodePanelCache();
    } catch (err) {
      window.alert("Failed to clear episode panel: " + String(err));
    } finally {
      setClearingPanel(false);
      setShowClearPanelConfirm(false);
    }
  };

  // TransNetV2 needs the optional `ml` pack. Prompt at the point of choice
  // rather than failing later, mid-import.
  const aiStatus = useAiDepsStore((s) => s.status);
  const mlInstalled = isPackInstalled(aiStatus, "ml");

  const sceneDetectionOptions = useMemo(
    () =>
      SCENE_DETECTION_OPTIONS.map((option) =>
        option.value === "transnetv2_gpu" && !mlInstalled
          ? {
              ...option,
              label: `${option.label} 🔒`,
              description: `Needs ${AI_PACKS.ml.dependencyName} (~${formatSizeMb(
                estimateDownloadMb(aiStatus, "ml"),
              )}) — selecting this offers to install it.`,
            }
          : option,
      ),
    [aiStatus, mlInstalled],
  );

  const handleSceneDetectionChange = async (method: SceneDetectionMethod) => {
    if (method === "transnetv2_gpu" && !mlInstalled) {
      const installed = await useAiDepsStore.getState().ensurePack("ml");
      if (!installed) return; // declined — keep the current method
    }
    setSceneDetectionMethod(method);
  };

  const handlePickDir = async () => {
    const selected = await open({
      multiple: false,
      directory: true,
      title: "Select Episodes Storage Directory",
    });

    if (selected && typeof selected === "string") {
      if (generalSettings.episodesPath !== selected) {
        setLoading(true);

        try {
          // Every clip tile in the grid keeps its file open in the WebView, and
          // Windows refuses to delete a file that is in use. Drop the grid and
          // let the browser release the handles before touching the files.
          useAppStateStore.getState().setClips([]);
          useAppStateStore.getState().setSelectedClips(new Set());
          await new Promise((resolve) => setTimeout(resolve, 250));

          const resolvedOldPath = await invoke<string>("move_episodes_to_new_dir", {
            oldDir: generalSettings.episodesPath,
            newDir: selected,
          });

          onEpisodesPathChanged(resolvedOldPath, selected);
          
          setGeneralSettings((prev) => ({ ...prev, episodesPath: selected }));
        } catch (err) {
          window.alert("Failed to move existing episodes: " + String(err));
        } finally {
          setLoading(false);
        }
      }
    }
  };

  return (
    <section className="panel menu-panel settings-panel">
      <h3>General</h3>
      <div className="about-content">
        {loading && (
          <div className="settings-row">
            <span className="settings-value" style={{ color: "#ff0" }}>
              Moving episodes to new directory...
            </span>
          </div>
        )}

        <SettingRow
          label="Application Version"
          description=""
          control={
          <div className="settings-control">
            <span className="settings-value" style={{ width: "auto" }}>
              v2.0.0
            </span>
          </div>
          }
        />

        <SettingRow
          label="Scene Detection Method"
          description="How scene boundaries are found during import."
          control={
            <Dropdown
              className="settings-wide-dropdown"
              options={sceneDetectionOptions}
              value={generalSettings.sceneDetectionMethod}
              onChange={(method) => void handleSceneDetectionChange(method)}
            />
          }
        />

        <SettingRow
          label="Preview Method"
          description="Choose whether grid preview should use source videos or generated WebP files."
          control={
            <Dropdown
              className="settings-wide-dropdown"
              options={PREVIEW_METHOD_OPTIONS}
              value={generalSettings.importMethod}
              onChange={(nextMethod) => {
                setImportMethod(nextMethod);
                if (nextMethod === "webp_files") {
                  setGridPreview(true);
                }
              }}
            />
          }
        />

        <SettingRow
          label="Re-encode Previews"
          description={
            hevcForced
              ? "This PC can't decode HEVC, so HEVC previews must be re-encoded to play."
              : "Choose whether to re-encode video previews on demand or not."
          }
          control={
            <Dropdown
              className="settings-wide-dropdown"
              options={
                hevcForced
                  ? PREVIEW_TRANSCODE_MODE_OPTIONS.filter((option) => option.value !== "off")
                  : PREVIEW_TRANSCODE_MODE_OPTIONS
              }
              value={effectivePreviewTranscodeMode}
              onChange={(mode) => setPreviewTranscodeMode(mode)}
            />
          }
        />

        {effectivePreviewTranscodeMode !== "off" && (
          <SettingRow
            label="Preview Quality"
            description="Resolution re-encoded previews are generated at."
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={PREVIEW_TRANSCODE_QUALITY_OPTIONS}
                value={generalSettings.previewTranscodeQuality}
                onChange={(quality) => setPreviewTranscodeQuality(quality)}
              />
            }
          />
        )}
      
        <SettingRow
          label="Audio Playback Hover"
          description="Automatically play clip audio when hovering over items in the grid."
          control={
            <div className="settings-control">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={generalSettings.audioPlaybackHover}
                  onChange={(e) =>
                    setGeneralSettings((prev) => ({
                      ...prev,
                      audioPlaybackHover: e.target.checked,
                    }))
                  }
                />
                <span className="checkmark"></span>
              </label>
            </div>
          }
        />

        <SettingRow
          label="Playback Volume"
          description="Adjust the master volume level for clip previews and audio playback."
          control={
            <div className="settings-control">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={generalSettings.playbackVolume}
                onChange={(e) =>
                  setGeneralSettings((prev) => ({
                    ...prev,
                    playbackVolume: parseFloat(e.target.value),
                  }))
                }
              />
              <span className="settings-value">
                {Math.round(generalSettings.playbackVolume * 100)}%
              </span>
            </div>
          }
        />

        <SettingRow
          label="Scenepacks"
          description="Enable the Scenepacks feature for grouping clips into themed collections."
          control={
            <div className="settings-control">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={generalSettings.scenepacksEnabled}
                  onChange={(e) => handleToggleScenepacksEnabled(e.target.checked)}
                />
                <span className="checkmark"></span>
              </label>
            </div>
          }
        />

        <SettingRow
          label="Episodes Storage Path"
          description="The location where your processed episodes and clips are stored."
          control={
            <div className="settings-control">
              <button
                className="buttons"
                type="button"
                onClick={handlePickDir}
                disabled={loading}
              >
                {generalSettings.episodesPath ? "Change" : "Select Path"}
              </button>
              <span
                className="settings-path-value"
                title={generalSettings.episodesPath || "Default (App Data)"}
              >
                {generalSettings.episodesPath || "Default (App Data)"}
              </span>
            </div>
          }
        />

        <SettingRow
          label="Clear Episode Storage"
          description="Remove all episodes from the panel and delete their cached files on disk. Scenepacks are untouched — they own their own storage."
          control={
            <div className="settings-control">
              <button
                className="buttons emergency"
                type="button"
                onClick={() => setShowClearPanelConfirm(true)}
                style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red" }}
                disabled={loading || clearingPanel}
              >
                {clearingPanel ? "Clearing..." : "Clear Episode Storage"}
              </button>
            </div>
          }
        />

        <SettingRow
          label="Clear Scenepack Storage"
          description="Remove all Scenepacks and delete their materialized clip files on disk. Episode storage is untouched."
          control={
            <div className="settings-control">
              <button
                className="buttons emergency"
                type="button"
                onClick={() => setShowClearScenepacksConfirm(true)}
                style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red" }}
                disabled={loading || clearingScenepacks}
              >
                {clearingScenepacks ? "Clearing..." : "Clear Scenepack Storage"}
              </button>
            </div>
          }
        />

        <SettingRow
          label="Factory Reset"
          description="Reset to Defaults"
          control={
            <div className="settings-control">
              <button
                className="buttons emergency"
                onClick={() => {
                  setShowFactoryResetConfirm(true);
                }}
                style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red" }}
                disabled={loading}
              >
                Reset to Defaults
              </button>
            </div>
          }
        />

        {showFactoryResetConfirm && (
          <div
            className="episode-modal-overlay"
            onMouseDown={() => setShowFactoryResetConfirm(false)}
          >
            <div className="episode-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">Factory Reset</div>
              <div className="episode-modal-message">{factoryResetConfirmation}</div>
              <div className="episode-modal-actions">
                <button
                  type="button"
                  className="episode-modal-btn"
                  onClick={() => setShowFactoryResetConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="episode-modal-btn primary"
                  onClick={() => {
                    setShowFactoryResetConfirm(false);
                    void onGeneralSettingsReset();
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {showClearPanelConfirm && (
          <div
            className="episode-modal-overlay"
            onMouseDown={() => {
              if (!clearingPanel) setShowClearPanelConfirm(false);
            }}
          >
            <div className="episode-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">Clear Episode Storage</div>
              <div className="episode-modal-message">{clearPanelConfirmation}</div>
              <div className="episode-modal-actions">
                <button
                  type="button"
                  className="episode-modal-btn"
                  onClick={() => setShowClearPanelConfirm(false)}
                  disabled={clearingPanel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="episode-modal-btn primary"
                  onClick={() => {
                    void handleClearEpisodePanel();
                  }}
                  disabled={clearingPanel}
                >
                  {clearingPanel ? "Clearing..." : "Clear Episode Storage"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showClearScenepacksConfirm && (
          <div
            className="episode-modal-overlay"
            onMouseDown={() => {
              if (!clearingScenepacks) setShowClearScenepacksConfirm(false);
            }}
          >
            <div className="episode-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">Clear Scenepack Storage</div>
              <div className="episode-modal-message">{clearScenepacksConfirmation}</div>
              <div className="episode-modal-actions">
                <button
                  type="button"
                  className="episode-modal-btn"
                  onClick={() => setShowClearScenepacksConfirm(false)}
                  disabled={clearingScenepacks}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="episode-modal-btn primary"
                  onClick={() => {
                    void handleClearScenepacks();
                  }}
                  disabled={clearingScenepacks}
                >
                  {clearingScenepacks ? "Clearing..." : "Clear Scenepack Storage"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDisableScenepacksConfirm && (
          <div
            className="episode-modal-overlay"
            onMouseDown={() => setShowDisableScenepacksConfirm(false)}
          >
            <div className="episode-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">Disable Scenepacks</div>
              <div className="episode-modal-message">
                You have {scenepacksCount} Scenepack{scenepacksCount !== 1 ? "s" : ""}. Would you like to delete
                {scenepacksCount !== 1 ? " them" : " it"} too, or just disable the feature and keep
                {scenepacksCount !== 1 ? " them" : " it"} for later?
              </div>
              <div className="episode-modal-actions">
                <button
                  type="button"
                  className="episode-modal-btn"
                  onClick={() => setShowDisableScenepacksConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="episode-modal-btn"
                  onClick={() => {
                    setGeneralSettings((prev) => ({ ...prev, scenepacksEnabled: false }));
                    setShowDisableScenepacksConfirm(false);
                  }}
                >
                  Keep Scenepacks
                </button>
                <button
                  type="button"
                  className="episode-modal-btn primary"
                  onClick={() => {
                    setGeneralSettings((prev) => ({ ...prev, scenepacksEnabled: false }));
                    setShowDisableScenepacksConfirm(false);
                    void clearScenepacksStorage().catch((err) =>
                      window.alert("Failed to clear Scenepack storage: " + String(err))
                    );
                  }}
                >
                  Delete Scenepacks
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
