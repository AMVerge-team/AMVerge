import { PanelLeftIcon, PanelRightIcon } from "./icons/chrome/ChromeIcons";
import { useState } from "react";
import { FaSyncAlt, FaTimes } from './icons/animated';
import Tooltip from "./common/Tooltip";
import PreviewAllToggle from "./common/PreviewAllToggle";
import { useAppStateStore } from "../stores/appStore";
import { useUIStateStore } from "../stores/UIStore";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";
import { openEpisodeById } from "../hooks/useEpisodePanelState";
import useImportExport from "../hooks/useImportExport";

export default function ImportButtons({ showImportControls = true }: { showImportControls?: boolean }) {
  const selectedClips = useAppStateStore((s: any) => s.selectedClips);
  const setSelectedClips = useAppStateStore((s: any) => s.setSelectedClips);
  const loading = useAppStateStore((s: any) => s.loading);
  const bgProgress = useAppStateStore((s: any) => s.bgProgress);
  const bgImportProgress = useAppStateStore((s: any) => s.bgImportProgress);
  const previewCollapsed = useUIStateStore((s: any) => s.previewCollapsed);
  const setPreviewCollapsed = useUIStateStore((s: any) => s.setPreviewCollapsed);
  const sidebarEnabled = useUIStateStore((s: any) => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore((s: any) => s.setSidebarEnabled);
  const previewSplitPct = useUIStateStore((s: any) => s.previewSplitPct);
  const openedEpisodeId = useEpisodePanelRuntimeStore((s) => s.openedEpisodeId);
  const { onImportClick } = useImportExport();

  // drives the one-shot spin animation on the refresh icon
  const [refreshSpinning, setRefreshSpinning] = useState(false);

  const hasSelection = selectedClips.size > 0;
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
          <Tooltip content={sidebarEnabled ? "Hide episode panel" : "Show episode panel"}>
              <button
                type="button"
                className={`import-button panel-toggle-button episode-panel-toggle${sidebarEnabled ? " active" : ""}`}
                onClick={() => setSidebarEnabled(!sidebarEnabled)}
                aria-label={sidebarEnabled ? "Hide episode panel" : "Show episode panel"}
                aria-pressed={sidebarEnabled}
              >
                <PanelLeftIcon filled={sidebarEnabled} />
              </button>
            </Tooltip>

          {showImportControls && (
            <>
            {/* stays enabled while something runs: importing then asks whether to stop it */}
            <Tooltip content="Import episode">
              <span className="tooltip-anchor">
                <button onClick={onImportClick}
                        className="import-button icon-action-button import-text-button"
                        id="file-button"
                >
                  Import
                </button>
              </span>
            </Tooltip>
            </>
          )}

          <PreviewAllToggle />

          {showImportControls && (
            <>
            {/* wrapper span: a disabled button fires no pointer events of its
                own, so the tooltip listens on the element around it */}
            <Tooltip content="Refresh episode">
              <span className="tooltip-anchor">
                <button
                  onClick={handleRefreshEpisode}
                  className="import-button refresh-button"
                  disabled={importBusy || !openedEpisodeId}
                  aria-label="Refresh episode"
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
          {/* only there while something is selected; the x clears the selection */}
          {hasSelection ? (
            <button type="button" className="selection-pill" onClick={() => setSelectedClips(new Set())}>
              {selectedClips.size} selected
              <FaTimes aria-hidden="true" />
            </button>
          ) : (
            <span />
          )}

          <Tooltip content={previewCollapsed ? "Show preview panel" : "Hide preview panel"} placement="bottom-end">
            <button
              type="button"
              className={`import-button panel-toggle-button${previewCollapsed ? "" : " active"}`}
              onClick={() => setPreviewCollapsed(!previewCollapsed)}
              aria-label={previewCollapsed ? "Show preview panel" : "Hide preview panel"}
              aria-pressed={!previewCollapsed}
            >
              <PanelRightIcon filled={!previewCollapsed} />
            </button>
          </Tooltip>
        </div>
      </main>
  )
}
