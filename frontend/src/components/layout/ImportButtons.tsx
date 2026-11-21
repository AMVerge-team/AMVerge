import { AiSceneDetectionIcon, KeyframeDetectionIcon, PanelLeftIcon, PanelRightIcon } from "../icons/chrome/ChromeIcons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaSyncAlt } from '../icons/animated';
import Tooltip from "../common/Tooltip";
import PreviewAllToggle from "../common/PreviewAllToggle";
import { SelectionCount } from "../clipsGrid/SelectionCount";
import { useAppStateStore } from "../../stores/appStore";
import { useUIStateStore } from "../../stores/UIStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { isPackInstalled } from "../../features/aiDeps/packs";
import { openEpisodeById } from "../../hooks/useEpisodePanelState";
import useImportExport from "../../hooks/useImportExport";

export default function ImportButtons({ showImportControls = true }: { showImportControls?: boolean }) {
  const { t } = useTranslation("jobs");
  const hasSelection = useAppStateStore((s: any) => s.selectedClips.size > 0);
  const loading = useAppStateStore((s: any) => s.loading);
  const bgProgress = useAppStateStore((s: any) => s.bgProgress);
  const bgImportProgress = useAppStateStore((s: any) => s.bgImportProgress);
  const previewCollapsed = useUIStateStore((s: any) => s.previewCollapsed);
  const setPreviewCollapsed = useUIStateStore((s: any) => s.setPreviewCollapsed);
  const sidebarEnabled = useUIStateStore((s: any) => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore((s: any) => s.setSidebarEnabled);
  const previewSplitPct = useUIStateStore((s: any) => s.previewSplitPct);
  const openedEpisodeId = useEpisodePanelRuntimeStore((s) => s.openedEpisodeId);
  const sceneDetectionMethod = useGeneralSettingsStore((s) => s.sceneDetectionMethod);
  const setSceneDetectionMethod = useGeneralSettingsStore((s) => s.setSceneDetectionMethod);
  const aiSceneDetectionEnabled = useGeneralSettingsStore((s) => s.aiSceneDetectionEnabled);
  const aiStatus = useAiDepsStore((s) => s.status);
  const mlInstalled = isPackInstalled(aiStatus, "ml");
  const isAiActive = sceneDetectionMethod === "transnetv2_gpu" && aiSceneDetectionEnabled && mlInstalled;
  const { onImportClick } = useImportExport();

  const handleToggleDetection = async () => {
    if (isAiActive) {
      setSceneDetectionMethod("keyframe_detection");
      return;
    }
    if (!mlInstalled) {
      const installed = await useAiDepsStore.getState().ensurePack("ml");
      if (!installed) return;
    }
    useGeneralSettingsStore.setState({ aiSceneDetectionEnabled: true });
    setSceneDetectionMethod("transnetv2_gpu");
  };

  // drives the one-shot spin animation on the refresh icon
  const [refreshSpinning, setRefreshSpinning] = useState(false);

  const importBusy = loading || Boolean(bgProgress) || Boolean(bgImportProgress);

  // re-opens the current episode with the same reset as switching away and back
  const handleRefreshEpisode = () => {
    if (!openedEpisodeId || importBusy) return;
    setRefreshSpinning(true);
    openEpisodeById(openedEpisodeId);
  };

  return (
      <main
        className="clips-import grid-toolbar"
        style={
          previewCollapsed
            ? undefined
            : { paddingRight: `calc(max(280px, ${100 - previewSplitPct}%) + 10px)` }
        }
      >
        <div className="import-buttons-container home-toolbar-buttons">
          <Tooltip content={sidebarEnabled ? t("importButtons.hideEpisodePanel") : t("importButtons.showEpisodePanel")}>
              <button
                type="button"
                className={`import-button panel-toggle-button episode-panel-toggle${sidebarEnabled ? " active" : ""}`}
                onClick={() => setSidebarEnabled(!sidebarEnabled)}
                aria-label={sidebarEnabled ? t("importButtons.hideEpisodePanel") : t("importButtons.showEpisodePanel")}
                aria-pressed={sidebarEnabled}
              >
                <PanelLeftIcon filled={sidebarEnabled} />
              </button>
            </Tooltip>

          {showImportControls && (
            <>
            {/* stays enabled while something runs: importing then asks whether to stop it */}
            <Tooltip content={t("importButtons.importEpisode")}>
              <span className="tooltip-anchor">
                <button onClick={onImportClick}
                        className="import-button icon-action-button import-text-button"
                        id="file-button"
                >
                  {t("importButtons.import")}
                </button>
              </span>
            </Tooltip>
            <Tooltip
              content={
                isAiActive
                  ? "Using AI Scene Detection (exact shot cuts). Click to switch to Keyframe Detection."
                  : "Using Keyframe Detection (instant, no GPU needed). Click to switch to AI Scene Detection."
              }
            >
              <button
                type="button"
                className={`import-button panel-toggle-button${isAiActive ? " active" : ""}`}
                onClick={() => void handleToggleDetection()}
                aria-label={isAiActive ? "AI Scene Detection active. Switch to Keyframe Detection" : "Keyframe Detection active. Switch to AI Scene Detection"}
                aria-pressed={isAiActive}
              >
                {isAiActive ? <AiSceneDetectionIcon filled /> : <KeyframeDetectionIcon />}
              </button>
            </Tooltip>
            </>
          )}

          <PreviewAllToggle />

          {showImportControls && (
            <>
            {/* wrapper span: a disabled button fires no pointer events of its
                own, so the tooltip listens on the element around it */}
            <Tooltip content={t("importButtons.refreshEpisode")}>
              <span className="tooltip-anchor">
                <button
                  onClick={handleRefreshEpisode}
                  className="import-button refresh-button"
                  disabled={importBusy || !openedEpisodeId}
                  aria-label={t("importButtons.refreshEpisode")}
                >
                  <FaSyncAlt
                    className={refreshSpinning ? "refresh-icon spinning" : "refresh-icon"}
                    onAnimationEnd={() => setRefreshSpinning(false)}
                  />
                </button>
              </span>
            </Tooltip>
            </>
          )}
        </div>
        <div className="grid-checkboxes">
          {/* the span keeps the panel toggle at the row's far end with nothing selected */}
          {hasSelection ? <SelectionCount /> : <span />}

          <Tooltip content={previewCollapsed ? t("importButtons.showPreviewPanel") : t("importButtons.hidePreviewPanel")} placement="bottom-end">
            <button
              type="button"
              className={`import-button panel-toggle-button${previewCollapsed ? "" : " active"}`}
              onClick={() => setPreviewCollapsed(!previewCollapsed)}
              aria-label={previewCollapsed ? t("importButtons.showPreviewPanel") : t("importButtons.hidePreviewPanel")}
              aria-pressed={!previewCollapsed}
            >
              <PanelRightIcon filled={!previewCollapsed} />
            </button>
          </Tooltip>
        </div>
      </main>
  )
}
