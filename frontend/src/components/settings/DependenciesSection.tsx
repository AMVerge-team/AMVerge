import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import SettingRow from "../common/SettingRow";
import SettingsSection from "../common/SettingsSection";
import AiModelsSection from "./AiModelsSection";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import {
  AI_PACKS,
  VISIBLE_PACK_IDS,
  estimateDownloadMb,
  formatBytes,
  formatSizeMb,
  isPackInstalled,
  plannedTorchVariant,
  type AiEnvStatus,
  type AiPackId,
} from "../../features/aiDeps/packs";

/**
 * Settings tab for the optional AI dependencies: what is installed, what a
 * missing pack would cost to download, and how to add or remove them outside of
 * the just-in-time prompt.
 */
export default function DependenciesSection() {
  const status = useAiDepsStore((s) => s.status);
  const loading = useAiDepsStore((s) => s.loading);
  const [busy, setBusy] = useState<AiPackId | "env" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useAiDepsStore.getState().refresh();
  }, []);

  const install = async (packId: AiPackId) => {
    setError(null);
    await useAiDepsStore.getState().ensurePack(packId);
  };

  // a removed pack leaves its settings pointing at something that is no longer
  // there, so they fall back rather than failing later mid-import or mid-export
  const resetSettingsFor = (packId: AiPackId | "all") => {
    const settings = useGeneralSettingsStore.getState();
    if (packId === "ml" || packId === "all") {
      if (settings.sceneDetectionMethod === "transnetv2_gpu") {
        settings.setSceneDetectionMethod("keyframe_detection");
      }
    }
    if (packId === "depth" || packId === "all") {
      settings.updatePostExportPasses("depth", { enabled: false });
    }
    if (packId === "interpolation" || packId === "all") {
      settings.updatePostExportPasses("interpolation", { enabled: false });
    }
  };

  const uninstall = async (packId: AiPackId) => {
    setBusy(packId);
    setError(null);
    try {
      const next = await invoke<AiEnvStatus>("uninstall_ai_pack", { pack: packId });
      useAiDepsStore.setState({ status: next });
      resetSettingsFor(packId);
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
      resetSettingsFor("all");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const gpuPreference = useAiDepsStore((s) => s.gpuPreference);

  const torchLabel = status?.torchVersion
    ? `${status.torchVersion} (${status.torchVariant === "cuda" ? "GPU / CUDA" : "CPU"})`
    : `not installed. Would use the ${
        plannedTorchVariant(status, gpuPreference) === "cuda" ? "GPU / CUDA" : "CPU"
      } build`;

  // not gated on the GPU probe: the undetected machines are the ones that need it
  const gpuRepairAvailable = Boolean(status?.envReady && status?.torchVariant === "cpu");
  const gpuUndetermined = status?.gpuProbe === "unknown" || Boolean(status?.statusError);

  // hidden on pre-Turing cards, where the rebuild would leave a worse env than it found
  const gpuDecodeOn = Boolean(status?.gpuDecodeInstalled);
  const gpuDecodeRowVisible = Boolean(
    status?.envReady && (gpuDecodeOn || status?.gpuDecodeSupported),
  );

  return (
    <section className="panel menu-panel settings-panel">
      <h3>Dependencies</h3>
      <div className="about-content">
        <SettingRow
          label="AI features"
          description="Everything else works out of the box. These features download what they need the first time you use them."
          control={
            <span className="settings-value" style={{ width: "auto" }}>
              {loading ? "checking…" : status?.envReady ? "installed" : "not installed"}
            </span>
          }
        />

        <SettingsSection id="deps.packs" title="AI Packs">
          <SettingRow
            label="PyTorch"
            description={
              !gpuRepairAvailable
                ? "Shared by every AI feature. It downloads once, then the rest install quickly."
                : status?.gpuAvailable
                  ? "The CPU version is installed, but this PC has an NVIDIA GPU. AI features are running much slower than they could."
                  : gpuUndetermined
                    ? "The CPU version is installed. AMVerge couldn't check whether this PC has an NVIDIA GPU, so if it does, AI features are running much slower than they could."
                    : "The CPU version is installed. No NVIDIA GPU was detected, but you can still force the GPU build if you believe that's wrong."
            }
            control={
              <div className="aid-pack-row">
                <span className="settings-value" style={{ width: "auto" }}>
                  {torchLabel}
                </span>
                {gpuRepairAvailable ? (
                  <button
                    type="button"
                    className="aid-btn aid-btn-primary"
                    onClick={() => void useAiDepsStore.getState().repairGpu()}
                    disabled={busy !== null}
                  >
                    Reinstall with GPU support
                  </button>
                ) : null}
              </div>
            }
          />

          {gpuDecodeRowVisible ? (
            <SettingRow
              label="GPU decode"
              description={
                gpuDecodeOn
                  ? "TransNetV2 reads video through the GPU's decoder. Files the hardware can't decode, such as 10-bit H.264, fall back to FFmpeg on their own."
                  : "Decodes video on the GPU for AI scene detection. Turning this on re-downloads PyTorch for compatibility."
              }
              control={
                <div className="aid-pack-row">
                  <span className="settings-value" style={{ width: "auto" }}>
                    {gpuDecodeOn ? "on" : "off"}
                  </span>
                  <button
                    type="button"
                    className="aid-btn"
                    onClick={() => void useAiDepsStore.getState().setGpuDecode(!gpuDecodeOn)}
                    disabled={busy !== null}
                  >
                    {gpuDecodeOn ? "Turn off" : "Turn on"}
                  </button>
                </div>
              }
            />
          ) : null}

          {VISIBLE_PACK_IDS.map((packId) => {
            const pack = AI_PACKS[packId];
            const installed = isPackInstalled(status, packId);
            return (
              <SettingRow
                key={packId}
                label={pack.label}
                description={`${pack.description} Requires ${pack.dependencyName}.`}
                control={
                  <div className="aid-pack-row">
                    <span className={`aid-state${installed ? " installed" : ""}`}>
                      {installed ? "Installed" : `~${formatSizeMb(estimateDownloadMb(status, packId))}`}
                    </span>
                    {installed ? (
                      <button
                        type="button"
                        className="aid-btn"
                        onClick={() => void uninstall(packId)}
                        disabled={busy !== null}
                      >
                        {busy === packId ? "Removing…" : "Remove"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="aid-btn aid-btn-primary"
                        onClick={() => void install(packId)}
                        disabled={busy !== null || status?.uvAvailable === false}
                      >
                        Install
                      </button>
                    )}
                  </div>
                }
              />
            );
          })}
        </SettingsSection>

        <SettingsSection id="deps.models" title="AI Models">
          <AiModelsSection />
        </SettingsSection>

        <SettingsSection id="deps.storage" title="Storage">
          <SettingRow
            label="Disk usage"
            description="Space used by the AI features and their Python environment."
            control={
              <span className="settings-value" style={{ width: "auto" }}>
                {formatBytes(status?.envSizeBytes ?? 0)}
              </span>
            }
          />

          <SettingRow
            label="Uninstall AI Features"
            description="Deletes every AI package. The rest of AMVerge keeps working, and you can reinstall any feature later."
            control={
              <button
                type="button"
                className="aid-btn"
                onClick={() => void removeEnv()}
                disabled={busy !== null || !status?.envReady}
              >
                {busy === "env" ? "Removing…" : "Remove"}
              </button>
            }
          />
        </SettingsSection>

        {status && !status.managed ? (
          <p className="setting-description">
            Dev build: AI features run from the AMVerge-CLI checkout's venv, so nothing is managed
            here.
          </p>
        ) : null}
        {error ? <p className="pxm-errors">{error}</p> : null}
      </div>
    </section>
  );
}
