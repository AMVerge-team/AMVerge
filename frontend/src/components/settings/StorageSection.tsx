import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import SettingRow from "../common/SettingRow";
import SettingsSection from "../common/SettingsSection";
import Tooltip from "../common/Tooltip";
import { FaFolderOpen } from "../icons/animated";
import { ConfirmModal } from "./general/ConfirmModal";
import { errorText, showNotice } from "../../features/notice/notice";
import { formatBytes, type AiEnvStatus } from "../../features/aiDeps/packs";
import { FEATURES } from "../../features/featureToggles";
import { runningProcess } from "../../features/processes/singleProcess";
import { rebaseStoragePaths, restoreOpenedEpisodeGrid } from "../../features/storage/rebaseStoragePaths";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { useAppStateStore } from "../../stores/appStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useStorageMoveStore } from "../../stores/storageMoveStore";
import { clearEpisodePanelCache } from "../../utils/episodeUtils";
import { clearScenepacksStorage } from "../../utils/scenepackStorage";

type StorageBreakdown = {
  episodesRoot: string;
  episodesBytes: number;
  episodesCount: number;
  scenepacksBytes: number;
  scenepacksCount: number;
  sceneScoutBytes: number;
  sceneScoutCount: number;
  previewCacheBytes: number;
  toolsCacheBytes: number;
  exportCacheBytes: number;
};

const BAR_COLORS = {
  episodes: "#38bdf8",
  scenepacks: "#a855f7",
  sceneScout: "#22c55e",
  ai: "#f59e0b",
  caches: "#64748b",
};

export default function StorageSection() {
  const episodesPath = useGeneralSettingsStore((s) => s.episodesPath);
  const setGeneralSettings = useGeneralSettingsStore.setState;
  const status = useAiDepsStore((s) => s.status);
  const aiInstallRunning = useAiDepsStore((s) => s.stage === "installing");
  const moveModalRunning = useStorageMoveStore((s) => s.stage === "moving");
  const activeJob = useAppStateStore(() => runningProcess());

  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [movingEpisodesTo, setMovingEpisodesTo] = useState<string | null>(null);
  const [movingAiTo, setMovingAiTo] = useState<string | null>(null);
  const [removingAi, setRemovingAi] = useState(false);
  const [clearingPreviews, setClearingPreviews] = useState(false);
  const [showClearPanelConfirm, setShowClearPanelConfirm] = useState(false);
  const [clearingPanel, setClearingPanel] = useState(false);
  const [showClearScenepacksConfirm, setShowClearScenepacksConfirm] = useState(false);
  const [clearingScenepacks, setClearingScenepacks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    const currentPath = useGeneralSettingsStore.getState().episodesPath;
    await Promise.all([
      useAiDepsStore.getState().refresh(),
      invoke<StorageBreakdown>("get_storage_breakdown", {
        customEpisodesPath: currentPath || null,
      })
        .then(setBreakdown)
        .catch((err) => setError(String(err))),
    ]);
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll, episodesPath]);

  const busy =
    Boolean(movingEpisodesTo) ||
    Boolean(movingAiTo) ||
    moveModalRunning ||
    removingAi ||
    aiInstallRunning ||
    activeJob !== null;

  const isMac = navigator.userAgent.includes("Mac OS X");
  const isLinux = navigator.userAgent.includes("Linux");
  const defaultEpisodesPathLabel = isMac
    ? "Default (Application Support)"
    : isLinux
      ? "Default (~/.local/share)"
      : "Default (App Data)";

  const episodesLabel = movingEpisodesTo
    ? `Moving to ${movingEpisodesTo}...`
    : episodesPath || defaultEpisodesPathLabel;

  const aiUsingLegacyAppData = Boolean(
    status &&
      !status.aiCustomPath &&
      status.aiDefaultPath &&
      status.aiRootPath &&
      status.aiRootPath.toLowerCase() !== status.aiDefaultPath.toLowerCase(),
  );

  const aiPathLabel = movingAiTo
    ? `Moving to ${movingAiTo}...`
    : status?.aiCustomPath
      ? status.aiCustomPath
      : status?.aiRootPath
        ? aiUsingLegacyAppData
          ? `${status.aiRootPath} (Existing AppData)`
          : `${status.aiRootPath} (Default)`
        : "Loading...";

  const handleMoveEpisodes = async (selected: string | null) => {
    if ((episodesPath || null) === selected) return;
    setError(null);
    setMovingEpisodesTo(selected ?? defaultEpisodesPathLabel);
    useStorageMoveStore.getState().begin("Moving Episodes Storage");

    try {
      // Windows won't delete files the grid's tiles hold open, so release them first.
      useAppStateStore.getState().setClips([]);
      useAppStateStore.getState().setSelectedClips(new Set());
      await new Promise((resolve) => setTimeout(resolve, 250));

      await invoke<string>("move_storage_to_new_dir", {
        oldDir: episodesPath,
        newDir: selected,
      });

      setGeneralSettings((prev) => ({ ...prev, episodesPath: selected }));
      await rebaseStoragePaths(selected ?? undefined);
      useStorageMoveStore.getState().finish("Episodes storage moved.");
    } catch (err) {
      useStorageMoveStore.getState().fail(errorText(err));
    } finally {
      restoreOpenedEpisodeGrid();
      setMovingEpisodesTo(null);
      await refreshAll();
    }
  };

  const pickEpisodesDir = async () => {
    const selected = await open({
      multiple: false,
      directory: true,
      title: "Select Episodes Storage Directory",
    });
    if (selected && typeof selected === "string") {
      await handleMoveEpisodes(selected);
    }
  };

  const handleMoveAi = async (selected: string | null) => {
    if ((status?.aiCustomPath ?? null) === selected) return;
    setError(null);
    setMovingAiTo(selected ?? "Default location");
    useStorageMoveStore.getState().begin("Moving AI Features Location");
    try {
      const next = await invoke<AiEnvStatus>("move_ai_storage_to_new_dir", {
        newDir: selected,
      });
      useAiDepsStore.setState({ status: next });
      useStorageMoveStore.getState().finish("AI features location updated.");
    } catch (err) {
      useStorageMoveStore.getState().fail(errorText(err));
    } finally {
      setMovingAiTo(null);
      await refreshAll();
    }
  };

  const pickAiDir = async () => {
    const selected = await open({
      multiple: false,
      directory: true,
      title: "Select App & AI Features Storage Directory",
    });
    if (selected && typeof selected === "string") {
      await handleMoveAi(selected);
    }
  };

  const clearPreviewCache = async () => {
    setClearingPreviews(true);
    setError(null);
    try {
      await invoke<number>("clear_preview_cache");
      await refreshAll();
    } catch (err) {
      setError(String(err));
    } finally {
      setClearingPreviews(false);
    }
  };

  const removeEnv = async () => {
    setRemovingAi(true);
    setError(null);
    try {
      const next = await invoke<AiEnvStatus>("remove_ai_env");
      useAiDepsStore.setState({ status: next });
      const settings = useGeneralSettingsStore.getState();
      for (const feature of FEATURES) {
        if (!feature.pack) continue;
        useGeneralSettingsStore.setState({ [feature.setting]: false });
        if (feature.id === "aiSceneDetection" && settings.sceneDetectionMethod === "transnetv2_gpu") {
          settings.setSceneDetectionMethod("keyframe_detection");
          useSceneScoutStore.getState().updateSettings({ lastIndexDetection: "keyframe_detection" });
        }
        if (feature.id === "depthPass") settings.updatePostExportPasses("depth", { enabled: false });
        if (feature.id === "upscalePass") settings.updatePostExportPasses("upscale", { enabled: false });
      }
      await refreshAll();
    } catch (err) {
      setError(String(err));
    } finally {
      setRemovingAi(false);
    }
  };

  const handleClearEpisodePanel = async () => {
    setClearingPanel(true);
    try {
      await clearEpisodePanelCache();
      await refreshAll();
    } catch (err) {
      void showNotice("Clear failed", "Failed to clear episode panel: " + errorText(err));
    } finally {
      setClearingPanel(false);
      setShowClearPanelConfirm(false);
    }
  };

  const handleClearScenepacks = async () => {
    setClearingScenepacks(true);
    try {
      await clearScenepacksStorage();
      await refreshAll();
    } catch (err) {
      void showNotice("Clear failed", "Failed to clear Scenepack storage: " + errorText(err));
    } finally {
      setClearingScenepacks(false);
      setShowClearScenepacksConfirm(false);
    }
  };

  const managed = status?.managed ?? true;
  const episodesBytes = breakdown?.episodesBytes ?? 0;
  const scenepacksBytes = breakdown?.scenepacksBytes ?? 0;
  const sceneScoutBytes = breakdown?.sceneScoutBytes ?? 0;
  const previewCacheBytes = breakdown?.previewCacheBytes ?? 0;
  const otherCacheBytes = (breakdown?.toolsCacheBytes ?? 0) + (breakdown?.exportCacheBytes ?? 0);
  const allCachesBytes = previewCacheBytes + otherCacheBytes;

  const packagesBytes = (status?.envSizeBytes ?? 0) + (status?.pythonSizeBytes ?? 0);
  const modelsBytes = status?.modelsSizeBytes ?? 0;
  const scoutModelBytes = status?.scoutModelSizeBytes ?? 0;
  const aiTotalBytes = packagesBytes + modelsBytes + scoutModelBytes;

  const grandTotalBytes = episodesBytes + scenepacksBytes + sceneScoutBytes + allCachesBytes + aiTotalBytes;

  const segments = [
    { key: "episodes", label: "Episodes", bytes: episodesBytes, color: BAR_COLORS.episodes },
    { key: "scenepacks", label: "Scenepacks", bytes: scenepacksBytes, color: BAR_COLORS.scenepacks },
    { key: "sceneScout", label: "Scene Scout", bytes: sceneScoutBytes, color: BAR_COLORS.sceneScout },
    { key: "ai", label: "AI Features", bytes: aiTotalBytes, color: BAR_COLORS.ai },
    { key: "caches", label: "Caches", bytes: allCachesBytes, color: BAR_COLORS.caches },
  ];

  return (
    <section className="panel menu-panel settings-panel">
      <h3>Storage</h3>
      <div className="about-content">
        <SettingsSection id="storage.locations" title="Locations">
          <SettingRow
            label="Episodes Storage Path"
            description="Where episodes and scenepacks live."
            control={
              <div className="settings-control">
                <Tooltip content={breakdown?.episodesRoot || episodesLabel} maxWidth={380}>
                  <span className={`settings-path-value storage-path-box${movingEpisodesTo ? " is-moving" : ""}`}>
                    {episodesLabel}
                  </span>
                </Tooltip>
                <Tooltip content="Change folder">
                  <button
                    className="buttons settings-path-btn"
                    type="button"
                    onClick={() => void pickEpisodesDir()}
                    disabled={busy}
                    aria-label="Change episodes storage folder"
                  >
                    <FaFolderOpen size={15} />
                  </button>
                </Tooltip>
                {episodesPath && (
                  <Tooltip content={`Move back to ${defaultEpisodesPathLabel}`}>
                    <button
                      type="button"
                      className="aid-btn"
                      onClick={() => void handleMoveEpisodes(null)}
                      disabled={busy}
                    >
                      Reset
                    </button>
                  </Tooltip>
                )}
              </div>
            }
          />

          <SettingRow
            label="App & AI Features Location"
            description="Where AI packages and models live."
            control={
              <div className="settings-control">
                <Tooltip content={status?.aiRootPath || aiPathLabel} maxWidth={380}>
                  <span className={`settings-path-value storage-path-box${movingAiTo ? " is-moving" : ""}`}>
                    {aiPathLabel}
                  </span>
                </Tooltip>
                <Tooltip content="Change folder">
                  <button
                    className="buttons settings-path-btn"
                    type="button"
                    onClick={() => void pickAiDir()}
                    disabled={busy}
                    aria-label="Change AI features folder"
                  >
                    <FaFolderOpen size={15} />
                  </button>
                </Tooltip>
                {status?.aiCustomPath && (
                  <Tooltip content={`Move back to ${status.aiDefaultPath || "default location"}`}>
                    <button
                      type="button"
                      className="aid-btn"
                      onClick={() => void handleMoveAi(null)}
                      disabled={busy}
                    >
                      Reset
                    </button>
                  </Tooltip>
                )}
              </div>
            }
          />
        </SettingsSection>

        <SettingsSection id="storage.breakdown" title="Breakdown">
          <div className="storage-overview">
            <div className="storage-overview-head">
              <span className="storage-overview-label">Total AMVerge Storage</span>
              <span className="settings-value storage-size-total">{formatBytes(grandTotalBytes)}</span>
            </div>
            <div className="storage-bar" role="img" aria-label={`Total storage ${formatBytes(grandTotalBytes)}`}>
              {grandTotalBytes > 0 ? (
                segments.map((seg) =>
                  seg.bytes > 0 ? (
                    <Tooltip key={seg.key} content={`${seg.label}: ${formatBytes(seg.bytes)}`}>
                      <div
                        className="storage-bar-seg"
                        style={{
                          width: `${Math.max(2, (seg.bytes / grandTotalBytes) * 100)}%`,
                          backgroundColor: seg.color,
                        }}
                      />
                    </Tooltip>
                  ) : null,
                )
              ) : (
                <div className="storage-bar-empty" />
              )}
            </div>
            <div className="storage-legend">
              {segments.map((seg) => (
                <span key={seg.key} className="storage-legend-item">
                  <span className="storage-legend-dot" style={{ backgroundColor: seg.color }} />
                  <span>{seg.label}</span>
                  <strong>{formatBytes(seg.bytes)}</strong>
                </span>
              ))}
            </div>
          </div>

          <SettingRow
            label="Episodes"
            description={`${breakdown?.episodesCount ?? 0} imported episode${(breakdown?.episodesCount ?? 0) === 1 ? "" : "s"}`}
            control={<span className="settings-value storage-size">{formatBytes(episodesBytes)}</span>}
          />
          <SettingRow
            label="Scenepacks"
            description={`${breakdown?.scenepacksCount ?? 0} saved scenepack${(breakdown?.scenepacksCount ?? 0) === 1 ? "" : "s"}`}
            control={<span className="settings-value storage-size">{formatBytes(scenepacksBytes)}</span>}
          />
          <SettingRow
            label="Scene Scout indexes"
            description={`${breakdown?.sceneScoutCount ?? 0} search database${(breakdown?.sceneScoutCount ?? 0) === 1 ? "" : "s"}`}
            control={<span className="settings-value storage-size">{formatBytes(sceneScoutBytes)}</span>}
          />
          <SettingRow
            label="Preview cache"
            description="Cached hover & match clips"
            control={
              <div className="aid-pack-row">
                <span className="settings-value storage-size">{formatBytes(previewCacheBytes)}</span>
                <button
                  type="button"
                  className="aid-btn"
                  onClick={() => void clearPreviewCache()}
                  disabled={clearingPreviews || previewCacheBytes === 0}
                >
                  {clearingPreviews ? "Clearing…" : "Clear"}
                </button>
              </div>
            }
          />
          <SettingRow
            label="Tools & export temp cache"
            description="Temporary processing files"
            control={<span className="settings-value storage-size">{formatBytes(otherCacheBytes)}</span>}
          />
        </SettingsSection>

        <SettingsSection id="storage.ai" title="AI Features">
          <SettingRow
            label="AI packages"
            description="PyTorch & AI dependencies"
            control={<span className="settings-value storage-size">{formatBytes(packagesBytes)}</span>}
          />
          <SettingRow
            label="Pass model weights"
            description="Depth & upscale weights"
            control={<span className="settings-value storage-size">{formatBytes(modelsBytes)}</span>}
          />
          <SettingRow
            label="Scene Scout model"
            description="SigLIP 2 search model"
            control={<span className="settings-value storage-size">{formatBytes(scoutModelBytes)}</span>}
          />
          <SettingRow
            label="Total AI storage"
            description="Combined AI disk usage"
            control={<span className="settings-value storage-size-total">{formatBytes(aiTotalBytes)}</span>}
          />
          <SettingRow
            label="Uninstall AI features"
            description="Remove packages, keep weights"
            control={
              <button
                type="button"
                className="aid-btn"
                onClick={() => void removeEnv()}
                disabled={busy || !status?.envReady || !managed}
              >
                {removingAi ? "Removing…" : "Remove"}
              </button>
            }
          />
        </SettingsSection>

        <SettingsSection id="storage.maintenance" title="Maintenance">
          <SettingRow
            label="Clear Episode Panel"
            description="Delete all imported episodes"
            control={
              <div className="settings-control">
                <button
                  className="buttons emergency"
                  type="button"
                  onClick={() => setShowClearPanelConfirm(true)}
                  style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red" }}
                  disabled={busy || clearingPanel}
                >
                  {clearingPanel ? "Clearing..." : "Clear Episode Storage"}
                </button>
              </div>
            }
          />

          <SettingRow
            label="Clear Scenepack Storage"
            description="Delete all saved scenepacks"
            control={
              <div className="settings-control">
                <button
                  className="buttons emergency"
                  type="button"
                  onClick={() => setShowClearScenepacksConfirm(true)}
                  style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red" }}
                  disabled={busy || clearingScenepacks}
                >
                  {clearingScenepacks ? "Clearing..." : "Clear Scenepack Storage"}
                </button>
              </div>
            }
          />
        </SettingsSection>

        {!managed ? (
          <p className="setting-description">
            Dev build: AI packages run from the AMVerge-CLI checkout's venv unless you pick a custom location.
          </p>
        ) : null}
        {error ? <p className="pxm-errors">{error}</p> : null}
      </div>

      {showClearPanelConfirm && (
        <ConfirmModal
          title="Clear Episode Storage"
          message="This will remove ALL episodes from the Episode Panel and delete their cached files on disk. This cannot be undone."
          confirmLabel={clearingPanel ? "Clearing..." : "Clear Episode Storage"}
          busy={clearingPanel}
          onClose={() => setShowClearPanelConfirm(false)}
          onConfirm={() => void handleClearEpisodePanel()}
        />
      )}

      {showClearScenepacksConfirm && (
        <ConfirmModal
          title="Clear Scenepack Storage"
          message="This will remove ALL Scenepacks and delete their materialized clip files on disk. This cannot be undone."
          confirmLabel={clearingScenepacks ? "Clearing..." : "Clear Scenepack Storage"}
          busy={clearingScenepacks}
          onClose={() => setShowClearScenepacksConfirm(false)}
          onConfirm={() => void handleClearScenepacks()}
        />
      )}
    </section>
  );
}
