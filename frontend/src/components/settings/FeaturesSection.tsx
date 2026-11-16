import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

import SettingRow from "../common/SettingRow";
import SettingsSection from "../common/SettingsSection";
import Tooltip from "../common/Tooltip";
import AiModelsSection from "./AiModelsSection";
import { ConfirmModal } from "./general/ConfirmModal";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { useAppStateStore } from "../../stores/appStore";
import { runningProcess } from "../../features/processes/singleProcess";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { clearScenepacksStorage } from "../../utils/scenepackStorage";
import { FEATURES, type FeatureId } from "../../features/featureToggles";
import {
  estimateDownloadMb,
  formatBytes,
  formatSizeMb,
  isPackInstalled,
  type AiEnvStatus,
  type AiPackId,
} from "../../features/aiDeps/packs";

/** Settings > Features: switch major features on and off; storage shows every byte the AI features use */
export default function FeaturesSection() {
  const { t } = useTranslation("settingsExport");
  const settings = useGeneralSettingsStore();
  const status = useAiDepsStore((s) => s.status);
  const gpuPreference = useAiDepsStore((s) => s.gpuPreference);
  const scenepacksCount = useScenepacksStore((s) => s.scenepacks.length);
  const [busy, setBusy] = useState<FeatureId | "env" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmScenepacksOff, setConfirmScenepacksOff] = useState(false);
  const [previewCacheBytes, setPreviewCacheBytes] = useState(0);
  const [clearingPreviews, setClearingPreviews] = useState(false);
  const importRunning = useAppStateStore(() => runningProcess() === "import");

  useEffect(() => {
    void useAiDepsStore.getState().refresh();
    invoke<number>("preview_cache_size").then(setPreviewCacheBytes).catch(() => {});
  }, []);

  // whatever is left is in use right now (a preview on screen, an encode running)
  const clearPreviewCache = async () => {
    setClearingPreviews(true);
    try {
      setPreviewCacheBytes(await invoke<number>("clear_preview_cache"));
    } catch (err) {
      setError(String(err));
    } finally {
      setClearingPreviews(false);
    }
  };

  // dev builds run the cli checkout's venv: nothing is downloaded or removed from here
  const managed = status?.managed ?? true;

  const setEnabled = (id: FeatureId, enabled: boolean) => {
    const feature = FEATURES.find((f) => f.id === id)!;
    useGeneralSettingsStore.setState({ [feature.setting]: enabled });
    if (enabled) return;
    // whatever pointed at the feature falls back, rather than failing later mid-import or mid-export
    if (id === "aiSceneDetection") {
      if (settings.sceneDetectionMethod === "transnetv2_gpu") settings.setSceneDetectionMethod("keyframe_detection");
      useSceneScoutStore.getState().updateSettings({ lastIndexDetection: "keyframe_detection" });
    }
    if (id === "depthPass") settings.updatePostExportPasses("depth", { enabled: false });
    if (id === "upscalePass") settings.updatePostExportPasses("upscale", { enabled: false });
  };

  const toggle = async (id: FeatureId, next: boolean) => {
    setError(null);
    const feature = FEATURES.find((f) => f.id === id)!;
    // scenepacks with packs saved asks first whether to keep them
    if (id === "scenepacks" && !next && scenepacksCount > 0) {
      setConfirmScenepacksOff(true);
      return;
    }
    // switching on downloads the pack; a declined install leaves it off
    if (next && feature.pack && !(await useAiDepsStore.getState().ensurePack(feature.pack))) return;
    setEnabled(id, next);
  };

  // the pack's own packages; torch stays for the other features
  const freeUpSpace = async (id: FeatureId, pack: AiPackId) => {
    setBusy(id);
    setError(null);
    try {
      const next = await invoke<AiEnvStatus>("uninstall_ai_pack", { pack });
      useAiDepsStore.setState({ status: next });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const removeEnv = async () => {
    setBusy("env");
    setError(null);
    try {
      const next = await invoke<AiEnvStatus>("remove_ai_env");
      useAiDepsStore.setState({ status: next });
      for (const feature of FEATURES) if (feature.pack) setEnabled(feature.id, false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  // a cpu torch on a machine with an nvidia gpu runs every ai feature far slower than it could
  const gpuRepairAvailable = Boolean(status?.envReady && status?.torchVariant === "cpu");

  const packagesBytes = (status?.envSizeBytes ?? 0) + (status?.pythonSizeBytes ?? 0);
  const modelsBytes = status?.modelsSizeBytes ?? 0;
  const scoutModelBytes = status?.scoutModelSizeBytes ?? 0;
  const totalBytes = packagesBytes + modelsBytes + scoutModelBytes + previewCacheBytes;

  return (
    <section className="panel menu-panel settings-panel">
      <h3>{t("features.title")}</h3>
      <div className="about-content">
        <SettingRow
          label={t("features.hideDisabled.label")}
          description={t("features.hideDisabled.description")}
          control={
            <button
              type="button"
              role="switch"
              aria-checked={settings.hideDisabledFeatures}
              aria-label={t("features.hideDisabled.label")}
              className="aid-switch"
              onClick={() => useGeneralSettingsStore.setState({ hideDisabledFeatures: !settings.hideDisabledFeatures })}
            />
          }
        />

        <SettingsSection id="features.list" title={t("features.list")}>
          {FEATURES.map((feature) => {
            const enabled = settings[feature.setting];
            const installed = feature.pack ? isPackInstalled(status, feature.pack) : true;
            // the text follows the switch; a pack not on disk yet adds its download size
            const onOff = enabled ? t("common:on") : t("common:off");
            const needsDownload = Boolean(feature.pack) && !installed && managed;
            const downloadSize = needsDownload
              ? formatSizeMb(estimateDownloadMb(status, feature.pack!, gpuPreference))
              : "";
            const stateText = !needsDownload
              ? feature.pack && installed && !enabled ? t("features.state.offDownloaded") : onOff
              : enabled
                ? t("features.state.onDownload", { size: downloadSize })
                : t("features.state.offDownload", { size: downloadSize });
            // a running import uses this pack, so installing or removing it underneath breaks the episode
            const lockedByImport = feature.id === "aiSceneDetection" && importRunning;
            return (
              <SettingRow
                key={feature.id}
                label={feature.label}
                description={feature.description}
                control={
                  <div className="aid-pack-row">
                    <span className={`aid-state${enabled ? " installed" : ""}`}>{stateText}</span>
                    {/* off with its files still on disk: offer the space back */}
                    {feature.pack && !enabled && installed && managed ? (
                      <button
                        type="button"
                        className="aid-btn"
                        onClick={() => void freeUpSpace(feature.id, feature.pack!)}
                        disabled={busy !== null || lockedByImport}
                      >
                        {busy === feature.id ? t("features.removing") : t("features.freeUpSpace")}
                      </button>
                    ) : null}
                    <Tooltip content={t("features.lockedByImport")} disabled={!lockedByImport}>
                      {/* a disabled button gets no hover events, so the span carries the tooltip */}
                      <span style={{ display: "inline-flex" }}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={feature.label}
                          className="aid-switch"
                          onClick={() => void toggle(feature.id, !enabled)}
                          disabled={
                            busy !== null ||
                            lockedByImport ||
                            (Boolean(feature.pack) && !enabled && status?.uvAvailable === false && managed)
                          }
                        />
                      </span>
                    </Tooltip>
                  </div>
                }
              />
            );
          })}
        </SettingsSection>

        {gpuRepairAvailable ? (
          <SettingsSection id="features.gpu" title={t("features.gpu.section")}>
            <SettingRow
              label="PyTorch"
              description={
                status?.gpuAvailable
                  ? t("features.gpu.cpuWithNvidia")
                  : t("features.gpu.cpuInstalled")
              }
              control={
                <button
                  type="button"
                  className="aid-btn aid-btn-primary"
                  onClick={() => void useAiDepsStore.getState().repairGpu()}
                  disabled={busy !== null}
                >
                  {t("features.gpu.reinstall")}
                </button>
              }
            />
          </SettingsSection>
        ) : null}

        <SettingsSection id="features.models" title={t("features.modelWeights")}>
          <AiModelsSection />
        </SettingsSection>

        <SettingsSection id="features.storage" title={t("features.storage.section")}>
          <SettingRow
            label={t("features.storage.packages.label")}
            description={t("features.storage.packages.description")}
            control={<span className="settings-value aid-size">{formatBytes(packagesBytes)}</span>}
          />
          <SettingRow
            label={t("features.storage.passModels.label")}
            description={t("features.storage.passModels.description")}
            control={<span className="settings-value aid-size">{formatBytes(modelsBytes)}</span>}
          />
          <SettingRow
            label={t("features.storage.scoutModel.label")}
            description={t("features.storage.scoutModel.description")}
            control={<span className="settings-value aid-size">{formatBytes(scoutModelBytes)}</span>}
          />
          <SettingRow
            label={t("features.storage.previewCache.label")}
            description={t("features.storage.previewCache.description")}
            control={
              <div className="aid-pack-row">
                <span className="settings-value aid-size">{formatBytes(previewCacheBytes)}</span>
                <button
                  type="button"
                  className="aid-btn"
                  onClick={() => void clearPreviewCache()}
                  disabled={clearingPreviews || previewCacheBytes === 0}
                >
                  {clearingPreviews ? t("features.storage.previewCache.clearing") : t("features.storage.previewCache.clear")}
                </button>
              </div>
            }
          />
          <SettingRow
            label={t("features.storage.total.label")}
            description={t("features.storage.total.description")}
            control={<span className="settings-value aid-size aid-size-total">{formatBytes(totalBytes)}</span>}
          />
          <SettingRow
            label={t("features.storage.uninstall.label")}
            description={t("features.storage.uninstall.description")}
            control={
              <button
                type="button"
                className="aid-btn"
                onClick={() => void removeEnv()}
                disabled={busy !== null || !status?.envReady || !managed}
              >
                {busy === "env" ? t("features.removing") : t("features.storage.uninstall.remove")}
              </button>
            }
          />
        </SettingsSection>

        {!managed ? (
          <p className="setting-description">
            {t("features.devBuild")}
          </p>
        ) : null}
        {error ? <p className="pxm-errors">{error}</p> : null}
      </div>

      {confirmScenepacksOff && (
        <ConfirmModal
          title={t("features.scenepacksOff.title")}
          message={t("features.scenepacksOff.message", { count: scenepacksCount })}
          confirmLabel={t("features.scenepacksOff.delete")}
          secondary={{
            label: t("features.scenepacksOff.keep"),
            onClick: () => {
              setEnabled("scenepacks", false);
              setConfirmScenepacksOff(false);
            },
          }}
          onClose={() => setConfirmScenepacksOff(false)}
          onConfirm={() => {
            setEnabled("scenepacks", false);
            setConfirmScenepacksOff(false);
            void clearScenepacksStorage().catch((err) => setError(t("features.scenepacksOff.clearFailed", { error: String(err) })));
          }}
        />
      )}
    </section>
  );
}
