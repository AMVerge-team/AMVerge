import { open } from "@tauri-apps/plugin-dialog";
import { errorText, showNotice } from "../../features/notice/notice";
import { invoke } from "@tauri-apps/api/core";
import {
  PreviewTranscodeMode,
  SceneDetectionMethod,
  useGeneralSettingsStore,
} from "../../stores/settingsStore";
import { useAppStateStore } from "../../stores/appStore";
import { useUIStateStore } from "../../stores/UIStore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SettingRow from "../common/SettingRow";
import Dropdown from "../common/Dropdown";
import SettingsSection from "../common/SettingsSection";
import InfoButton from "../common/InfoButton";
import Tooltip from "../common/Tooltip";
import { clearEpisodePanelCache } from "../../utils/episodeUtils";
import { clearScenepacksStorage } from "../../utils/scenepackStorage";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { isPackInstalled } from "../../features/aiDeps/packs";
import { runningProcess } from "../../features/processes/singleProcess";
import {
  previewMethodOptions,
  previewTranscodeModeOptions,
  previewTranscodeQualityOptions,
  sceneDetectionOptions,
} from "./general/options";
import { ConfirmModal } from "./general/ConfirmModal";
import { rebaseStoragePaths, restoreOpenedEpisodeGrid } from "../../features/storage/rebaseStoragePaths";
import { useDavinciInstalled } from "../../features/davinci/useDavinciAvailable";
import LanguagePicker from "./general/LanguagePicker";

type GeneralSettingsProps = {
  onGeneralSettingsReset: () => void;
};

export default function GeneralSettings({
  onGeneralSettingsReset,
}: GeneralSettingsProps) {
  const { t } = useTranslation("settings");
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
  const [loading, setLoading] = useState(false);
  const davinciInstalled = useDavinciInstalled();
  // a move to another drive copies every episode, which can take minutes; the row says so meanwhile
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false);
  const [showClearPanelConfirm, setShowClearPanelConfirm] = useState(false);
  const [clearingPanel, setClearingPanel] = useState(false);
  const [showClearScenepacksConfirm, setShowClearScenepacksConfirm] = useState(false);
  const [clearingScenepacks, setClearingScenepacks] = useState(false);
  const defaultEpisodesPathLabel = navigator.userAgent.includes("Mac OS X")
    ? t("general.storage.defaultPathMac")
    : t("general.storage.defaultPath");
  const factoryResetConfirmation = t("general.maintenance.factoryResetConfirm");
  const clearPanelConfirmation = t("general.maintenance.clearPanelConfirm");
  const clearScenepacksConfirmation = t("general.maintenance.clearScenepacksConfirm");
  const handleClearScenepacks = async () => {
    setClearingScenepacks(true);
    try {
      await clearScenepacksStorage();
    } catch (err) {
      void showNotice(
        t("general.maintenance.clearFailedTitle"),
        t("general.maintenance.clearScenepacksFailed", { error: errorText(err) })
      );
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
      void showNotice(
        t("general.maintenance.clearFailedTitle"),
        t("general.maintenance.clearPanelFailed", { error: errorText(err) })
      );
    } finally {
      setClearingPanel(false);
      setShowClearPanelConfirm(false);
    }
  };

  // TransNetV2 needs the `ml` pack, so the install is offered when it is chosen
  const aiStatus = useAiDepsStore((s) => s.status);
  const mlInstalled = isPackInstalled(aiStatus, "ml");
  const aiDepsBusy = useAiDepsStore((s) => s.stage === "installing");
  // a running import has nelux loaded, so swapping it underneath fails or breaks the episode
  const importRunning = useAppStateStore(() => runningProcess() === "import");

  useEffect(() => {
    if (!useAiDepsStore.getState().status) void useAiDepsStore.getState().refresh();
  }, []);

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
      title: t("general.storage.pickDirTitle"),
    });

    if (selected && typeof selected === "string") {
      if (generalSettings.episodesPath !== selected) {
        setLoading(true);
        setMovingTo(selected);

        try {
          // windows won't delete files the grid's tiles hold open, so drop the grid first
          useAppStateStore.getState().setClips([]);
          useAppStateStore.getState().setSelectedClips(new Set());
          await new Promise((resolve) => setTimeout(resolve, 250));

          await invoke<string>("move_storage_to_new_dir", {
            oldDir: generalSettings.episodesPath,
            newDir: selected,
          });

          setGeneralSettings((prev) => ({ ...prev, episodesPath: selected }));
          // `selected` is the storage root; episodes sit in its episodes_storage folder
          await rebaseStoragePaths(selected);
        } catch (err) {
          void showNotice(
            t("general.storage.moveFailedTitle"),
            t("general.storage.moveFailed", { error: errorText(err) })
          );
        } finally {
          // the grid was emptied for the move; failed or not, the open episode comes back
          restoreOpenedEpisodeGrid();
          setLoading(false);
          setMovingTo(null);
        }
      }
    }
  };

  const storagePathLabel = movingTo
    ? t("general.storage.movingTo", { path: movingTo })
    : generalSettings.episodesPath || defaultEpisodesPathLabel;

  return (
    <section className="panel menu-panel settings-panel">
      <h3>{t("general.title")}</h3>
      <div className="about-content">
        <SettingRow
          label={t("general.version")}
          description=""
          control={
          <div className="settings-control">
            <span className="settings-value" style={{ width: "auto" }}>
              v2.0.1
            </span>
          </div>
          }
        />

        <SettingRow
          label={t("common:language.label")}
          description={t("common:language.description")}
          control={<LanguagePicker />}
        />

        <SettingsSection id="general.import" title={t("general.import.title")}>
          <SettingRow
            label={t("general.import.sceneDetection.label")}
            description={t("general.import.sceneDetection.description")}
            info={
              <InfoButton title={t("general.import.sceneDetection.label")}>
                <h4>{t("general.import.sceneDetection.info.ai.title")}</h4>
                <p>{t("general.import.sceneDetection.info.ai.p1")}</p>
                <p>{t("general.import.sceneDetection.info.ai.p2")}</p>
                <p>{t("general.import.sceneDetection.info.ai.p3")}</p>

                <h4>{t("general.import.sceneDetection.info.keyframe.title")}</h4>
                <p>{t("general.import.sceneDetection.info.keyframe.p1")}</p>
                <p>{t("general.import.sceneDetection.info.keyframe.p2")}</p>
                <p>{t("general.import.sceneDetection.info.keyframe.p3")}</p>
              </InfoButton>
            }
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={sceneDetectionOptions(generalSettings.aiSceneDetectionEnabled)}
                value={generalSettings.sceneDetectionMethod}
                onChange={(method) => void handleSceneDetectionChange(method)}
              />
            }
          />

          {/* only once AI Scene Detection is installed and on, since only it decodes this way */}
          {generalSettings.aiSceneDetectionEnabled && mlInstalled && (
            <SettingRow
              label={t("general.import.gpuDecoding.label")}
              description={
                !aiStatus?.managed
                  ? t("general.import.gpuDecoding.devBuild")
                  : aiStatus.gpuDecodeSupported
                    ? t("general.import.gpuDecoding.description")
                    : t("general.import.gpuDecoding.unsupported")
              }
              control={
                <Tooltip content={t("general.import.gpuDecoding.disabledWhileImporting")} disabled={!importRunning}>
                  {/* a disabled button gets no hover events, so the span carries the tooltip */}
                  <span style={{ display: "inline-flex" }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(aiStatus?.gpuDecodeInstalled)}
                      aria-label={t("general.import.gpuDecoding.label")}
                      className="aid-switch"
                      disabled={!aiStatus?.managed || !aiStatus.gpuDecodeSupported || aiDepsBusy || importRunning}
                      onClick={() => void useAiDepsStore.getState().setGpuDecode(!aiStatus?.gpuDecodeInstalled)}
                    />
                  </span>
                </Tooltip>
              }
            />
          )}
        </SettingsSection>

        <SettingsSection id="general.preview" title={t("general.preview.title")}>
        <SettingRow
          label={t("general.preview.method.label")}
          description={t("general.preview.method.description")}
          info={
            <InfoButton title={t("general.preview.method.label")}>
              <h4>{t("general.preview.method.info.video.title")}</h4>
              <p>{t("general.preview.method.info.video.p1")}</p>
              <p>{t("general.preview.method.info.video.p2")}</p>

              <h4>{t("general.preview.method.info.webp.title")}</h4>
              <p>{t("general.preview.method.info.webp.p1")}</p>
              <p>{t("general.preview.method.info.webp.p2")}</p>
              <p>{t("general.preview.method.info.webp.p3")}</p>
            </InfoButton>
          }
          control={
            <Dropdown
              className="settings-wide-dropdown"
              options={previewMethodOptions()}
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
          label={t("general.preview.reencode.label")}
          description={
            hevcForced
              ? t("general.preview.reencode.hevcForced")
              : t("general.preview.reencode.description")
          }
          control={
            <Dropdown
              className="settings-wide-dropdown"
              options={
                hevcForced
                  ? previewTranscodeModeOptions().filter((option) => option.value !== "off")
                  : previewTranscodeModeOptions()
              }
              value={effectivePreviewTranscodeMode}
              onChange={(mode) => setPreviewTranscodeMode(mode)}
            />
          }
        />

        {effectivePreviewTranscodeMode !== "off" && (
          <SettingRow
            label={t("general.preview.quality.label")}
            description={t("general.preview.quality.description")}
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={previewTranscodeQualityOptions()}
                value={generalSettings.previewTranscodeQuality}
                onChange={(quality) => setPreviewTranscodeQuality(quality)}
              />
            }
          />
        )}
      
        <SettingRow
          label={t("general.preview.audioHover.label")}
          description={t("general.preview.audioHover.description")}
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
          label={t("general.preview.volume.label")}
          description={t("general.preview.volume.description")}
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

        {/* scenepacks and the other major features moved to Settings > Features */}
        {/* only Resolve lives here, so the section shows only where Resolve is installed */}
        {davinciInstalled && (
        <SettingsSection id="general.integrations" title={t("general.integrations.title")}>
        <SettingRow
          label={t("general.integrations.davinci.label")}
          description={t("general.integrations.davinci.description")}
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
        )}

        <SettingsSection id="general.storage" title={t("general.storage.title")}>
        <SettingRow
          label={t("general.storage.path.label")}
          description={t("general.storage.path.description")}
          control={
            <div className="settings-control">
              <button
                className="buttons settings-path-btn"
                type="button"
                onClick={handlePickDir}
                disabled={loading}
              >
                {movingTo
                  ? t("general.storage.moving")
                  : generalSettings.episodesPath
                    ? t("general.storage.change")
                    : t("general.storage.selectPath")}
              </button>
              <Tooltip content={storagePathLabel} maxWidth={360}>
                <span className={`settings-path-value${movingTo ? " is-moving" : ""}`}>
                  {storagePathLabel}
                </span>
              </Tooltip>
            </div>
          }
        />
        </SettingsSection>

        <SettingsSection id="general.maintenance" title={t("general.maintenance.title")}>
        <SettingRow
          label={t("general.maintenance.clearPanel.label")}
          description={t("general.maintenance.clearPanel.description")}
          control={
            <div className="settings-control">
              <button
                className="buttons emergency"
                type="button"
                onClick={() => setShowClearPanelConfirm(true)}
                style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red" }}
                disabled={loading || clearingPanel}
              >
                {clearingPanel ? t("general.maintenance.clearing") : t("general.maintenance.clearPanel.button")}
              </button>
            </div>
          }
        />

        <SettingRow
          label={t("general.maintenance.clearScenepacks.label")}
          description={t("general.maintenance.clearScenepacks.description")}
          control={
            <div className="settings-control">
              <button
                className="buttons emergency"
                type="button"
                onClick={() => setShowClearScenepacksConfirm(true)}
                style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red" }}
                disabled={loading || clearingScenepacks}
              >
                {clearingScenepacks ? t("general.maintenance.clearing") : t("general.maintenance.clearScenepacks.button")}
              </button>
            </div>
          }
        />

        <SettingRow
          label={t("general.maintenance.factoryReset.label")}
          description={t("general.maintenance.factoryReset.description")}
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
                {t("resetToDefaults")}
              </button>
            </div>
          }
        />
        </SettingsSection>

        {showFactoryResetConfirm && (
          <ConfirmModal
            title={t("general.maintenance.factoryReset.label")}
            message={factoryResetConfirmation}
            confirmLabel={t("common:reset")}
            onClose={() => setShowFactoryResetConfirm(false)}
            onConfirm={() => {
              setShowFactoryResetConfirm(false);
              void onGeneralSettingsReset();
            }}
          />
        )}

        {showClearPanelConfirm && (
          <ConfirmModal
            title={t("general.maintenance.clearPanel.button")}
            message={clearPanelConfirmation}
            confirmLabel={clearingPanel ? t("general.maintenance.clearing") : t("general.maintenance.clearPanel.button")}
            busy={clearingPanel}
            onClose={() => setShowClearPanelConfirm(false)}
            onConfirm={() => void handleClearEpisodePanel()}
          />
        )}

        {showClearScenepacksConfirm && (
          <ConfirmModal
            title={t("general.maintenance.clearScenepacks.button")}
            message={clearScenepacksConfirmation}
            confirmLabel={clearingScenepacks ? t("general.maintenance.clearing") : t("general.maintenance.clearScenepacks.button")}
            busy={clearingScenepacks}
            onClose={() => setShowClearScenepacksConfirm(false)}
            onConfirm={() => void handleClearScenepacks()}
          />
        )}
      </div>
    </section>
  );
}
