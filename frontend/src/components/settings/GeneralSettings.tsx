import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  PreviewTranscodeMode,
  SceneDetectionMethod,
  useGeneralSettingsStore,
} from "../../stores/settingsStore";
import { useAppStateStore } from "../../stores/appStore";
import { useUIStateStore } from "../../stores/UIStore";
import { useEffect, useState} from "react";
import SettingRow from "../common/SettingRow";
import Dropdown from "../common/Dropdown";
import SettingsSection from "../common/SettingsSection";
import InfoButton from "../common/InfoButton";
import Tooltip from "../common/Tooltip";
import { clearEpisodePanelCache } from "../../utils/episodeUtils";
import { clearScenepacksStorage } from "../../utils/scenepackStorage";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { isPackInstalled } from "../../features/aiDeps/packs";
import {
  PREVIEW_METHOD_OPTIONS,
  PREVIEW_TRANSCODE_MODE_OPTIONS,
  PREVIEW_TRANSCODE_QUALITY_OPTIONS,
  SCENE_DETECTION_OPTIONS,
} from "./general/options";
import { ConfirmModal } from "./general/ConfirmModal";

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

  // turning Scenepacks off with packs still saved asks what to do with them
  // first; turning it on is immediate
  const handleToggleScenepacksEnabled = (enabled: boolean) => {
    if (!enabled && scenepacksCount > 0) {
      setShowDisableScenepacksConfirm(true);
      return;
    }
    setGeneralSettings((prev) => ({ ...prev, scenepacksEnabled: enabled }));
  };

  const handleClearScenepacks = async () => {
    setClearingScenepacks(true);
    try {
      await clearScenepacksStorage();
    } catch (err) {
      window.alert("Failed to clear Scenepack storage: " + String(err));
    } finally {
      setClearingScenepacks(false);
      setShowClearScenepacksConfirm(false);
    }
  };

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

  // TransNetV2 needs the optional `ml` pack. prompt at the point of choice
  // rather than failing later, mid-import
  const aiStatus = useAiDepsStore((s) => s.status);
  const mlInstalled = isPackInstalled(aiStatus, "ml");

  const handleSceneDetectionChange = async (method: SceneDetectionMethod) => {
    if (method === "transnetv2_gpu" && !mlInstalled) {
      const installed = await useAiDepsStore.getState().ensurePack("ml");
      if (!installed) return; // declined, keep the current method
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
          // every clip tile in the grid keeps its file open in the WebView, and
          // Windows refuses to delete a file that is in use. drop the grid and
          // let the browser release the handles before touching the files
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

        <SettingsSection id="general.import" title="Import">
          <SettingRow
            label="Scene Detection Method"
            description="How AMVerge finds scene cuts when you import."
            info={
              <InfoButton title="Scene Detection Method">
                <h4>AI Scene Detection</h4>
                <p>
                  Runs every frame of the episode through TransNetV2, a neural network
                  trained to spot the moment one shot ends and the next begins. It is the
                  most accurate option and catches cuts that other methods miss.
                </p>
                <p>
                  It is also the slowest, because the whole episode has to be decoded and
                  looked at frame by frame. A GPU makes this much faster.
                </p>
                <p>
                  Near the end of an import you may see some clips being re-encoded. Video
                  can only be split instantly at a keyframe, so any clip whose cut does not
                  land on one gets rebuilt. That is what makes each clip start exactly where
                  the AI said the shot changed instead of a moment early or late.
                </p>

                <h4>Keyframe Detection</h4>
                <p>
                  A video file does not store a full picture for every frame. Every so often
                  it saves a complete one, called a keyframe, and the frames after it only
                  store what changed since. Those complete pictures are the only places a
                  video can be cut without rebuilding it.
                </p>
                <p>
                  This method cuts at those points and nowhere else, so it is instant and
                  works on any PC with no GPU needed. It is by far the fastest way to import.
                </p>
                <p>
                  The tradeoff is accuracy. Cuts land on the nearest keyframe rather than the
                  exact shot change, so a clip can start slightly early or late, and shot
                  changes that happen between keyframes are missed entirely.
                </p>
              </InfoButton>
            }
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={SCENE_DETECTION_OPTIONS}
                value={generalSettings.sceneDetectionMethod}
                onChange={(method) => void handleSceneDetectionChange(method)}
              />
            }
          />
        </SettingsSection>

        <SettingsSection id="general.preview" title="Preview & Playback">
        <SettingRow
          label="Preview Method"
          description="What the grid plays when you hover over a clip."
          info={
            <InfoButton title="Preview Method">
              <h4>Video Files</h4>
              <p>
                Cuts a real video clip for every scene. Hovering a tile plays the actual
                video, so what you see is exactly what you get when you export.
              </p>
              <p>
                Each tile that plays is a real video being decoded, so a long episode with
                hundreds of scenes asks a lot of your PC. This is the heavier option.
              </p>

              <h4>WebP Files</h4>
              <p>
                Builds a small animated preview for each scene instead, similar to a GIF.
                They are far lighter than video, so scrolling and hovering stay smooth even
                with hundreds of scenes. If the app feels slow, this is the option to pick.
              </p>
              <p>
                The cost is import time. Every preview has to be made up front, so importing
                takes noticeably longer than it does with video files.
              </p>
              <p>
                This only changes what you preview in the grid. Exports are always cut from
                the original episode video, so your exported clips are full quality either
                way.
              </p>
            </InfoButton>
          }
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
              ? "This PC can't play HEVC, so those previews have to be re-encoded."
              : "Re-encode previews for smoother playback and HEVC support."
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
            description="Resolution for re-encoded previews. Audio and timing are kept."
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
          description="Play a clip's audio when you hover over it."
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
          description="Master volume for clip previews and playback."
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
        </SettingsSection>

        <SettingsSection id="general.features" title="Features">
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
          label="DaVinci Resolve Compatibility"
          description="Send exported clips straight to the DaVinci Resolve timeline (Studio only)."
          control={
            <div className="settings-control">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={generalSettings.davinciResolveEnabled}
                  onChange={(e) =>
                    setGeneralSettings((prev) => ({
                      ...prev,
                      davinciResolveEnabled: e.target.checked,
                    }))
                  }
                />
                <span className="checkmark"></span>
              </label>
            </div>
          }
        />
        </SettingsSection>

        <SettingsSection id="general.storage" title="Storage">
        <SettingRow
          label="Episodes Storage Path"
          description="Where your imported episodes and clips are saved."
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
              <Tooltip
                content={generalSettings.episodesPath || "Default (App Data)"}
                maxWidth={360}
              >
                <span className="settings-path-value">
                  {generalSettings.episodesPath || "Default (App Data)"}
                </span>
              </Tooltip>
            </div>
          }
        />
        </SettingsSection>

        <SettingsSection id="general.maintenance" title="Maintenance">
        <SettingRow
          label="Clear Episode Panel"
          description="Removes every episode from the panel and deletes its files."
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
          description="Remove all Scenepacks and delete its files."
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
          description="Puts every General setting back to its default."
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
        </SettingsSection>

        {showFactoryResetConfirm && (
          <ConfirmModal
            title="Factory Reset"
            message={factoryResetConfirmation}
            confirmLabel="Reset"
            onClose={() => setShowFactoryResetConfirm(false)}
            onConfirm={() => {
              setShowFactoryResetConfirm(false);
              void onGeneralSettingsReset();
            }}
          />
        )}

        {showClearPanelConfirm && (
          <ConfirmModal
            title="Clear Episode Storage"
            message={clearPanelConfirmation}
            confirmLabel={clearingPanel ? "Clearing..." : "Clear Episode Storage"}
            busy={clearingPanel}
            onClose={() => setShowClearPanelConfirm(false)}
            onConfirm={() => void handleClearEpisodePanel()}
          />
        )}

        {showClearScenepacksConfirm && (
          <ConfirmModal
            title="Clear Scenepack Storage"
            message={clearScenepacksConfirmation}
            confirmLabel={clearingScenepacks ? "Clearing..." : "Clear Scenepack Storage"}
            busy={clearingScenepacks}
            onClose={() => setShowClearScenepacksConfirm(false)}
            onConfirm={() => void handleClearScenepacks()}
          />
        )}

        {showDisableScenepacksConfirm && (
          <ConfirmModal
            title="Disable Scenepacks"
            message={
              <>
                You have {scenepacksCount} Scenepack{scenepacksCount !== 1 ? "s" : ""}. Would you
                like to delete{scenepacksCount !== 1 ? " them" : " it"} too, or just disable the
                feature and keep{scenepacksCount !== 1 ? " them" : " it"} for later?
              </>
            }
            confirmLabel="Delete Scenepacks"
            secondary={{
              label: "Keep Scenepacks",
              onClick: () => {
                setGeneralSettings((prev) => ({ ...prev, scenepacksEnabled: false }));
                setShowDisableScenepacksConfirm(false);
              },
            }}
            onClose={() => setShowDisableScenepacksConfirm(false)}
            onConfirm={() => {
              setGeneralSettings((prev) => ({ ...prev, scenepacksEnabled: false }));
              setShowDisableScenepacksConfirm(false);
              void clearScenepacksStorage().catch((err) =>
                window.alert("Failed to clear Scenepack storage: " + String(err))
              );
            }}
          />
        )}
      </div>
    </section>
  );
}
