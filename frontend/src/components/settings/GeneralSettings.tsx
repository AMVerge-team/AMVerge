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
  const davinciInstalled = useDavinciInstalled();
  const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false);
  const isMac = navigator.userAgent.includes("Mac OS X");
  const isLinux = navigator.userAgent.includes("Linux");
  const storageLocationName = isMac ? "Application Support" : isLinux ? "~/.local/share" : "AppData";
  const factoryResetConfirmation = t("general.maintenance.factoryResetConfirm", { location: storageLocationName });

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
    if (method === "transnetv2_gpu") {
      if (!mlInstalled) {
        const installed = await useAiDepsStore.getState().ensurePack("ml");
        if (!installed) return; // declined, keep the current method
      }
      if (!generalSettings.aiSceneDetectionEnabled) {
        useGeneralSettingsStore.setState({ aiSceneDetectionEnabled: true });
      }
    }
    setSceneDetectionMethod(method);
  };

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
              v2.0.2
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
            tourTarget="scene-detection"
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
                options={sceneDetectionOptions(generalSettings.aiSceneDetectionEnabled && mlInstalled)}
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
          tourTarget="preview-method"
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
                className="quality-dropdown"
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

        <SettingsSection id="general.maintenance" title={t("general.maintenance.title")}>
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
      </div>
    </section>
  );
}
