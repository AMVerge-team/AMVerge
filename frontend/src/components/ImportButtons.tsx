import { useState } from "react";
import { FaSyncAlt } from "react-icons/fa";
import Tooltip from "./common/Tooltip";
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
  const gridPreview = useUIStateStore((s: any) => s.gridPreview);
  const setGridPreview = useUIStateStore((s: any) => s.setGridPreview);
  const previewCollapsed = useUIStateStore((s: any) => s.previewCollapsed);
  const setPreviewCollapsed = useUIStateStore((s: any) => s.setPreviewCollapsed);
  const openedEpisodeId = useEpisodePanelRuntimeStore((s) => s.openedEpisodeId);
  const { onImportClick } = useImportExport();

  // drives the one-shot spin animation on the refresh icon.
  const [refreshSpinning, setRefreshSpinning] = useState(false);

  const hasSelection = selectedClips.size > 0;
  const importBusy = loading || Boolean(bgProgress) || Boolean(bgImportProgress);

  // re-opens the current episode: fresh import token, cleared selection/focus,
  // remounted tiles — same reset as switching away and back, without leaving.
  const handleRefreshEpisode = () => {
    if (!openedEpisodeId || importBusy) return;
    setRefreshSpinning(true);
    openEpisodeById(openedEpisodeId);
  };

  return (
      <main className="clips-import">
        {showImportControls && (
          <div className="import-buttons-container">
            <button onClick={onImportClick}
                    className="import-button"
                    disabled={importBusy}
                    id="file-button"
            >
              {importBusy ? "Processing...": "Import Episode"}
            </button>
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
          </div>
        )}
        <div className="grid-checkboxes">
          <div className="selectable-checkboxes">
            <div className="checkbox-row">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={gridPreview}
                  onChange={(e) => setGridPreview(e.target.checked)}
                />
                <span className="checkmark"></span>
              </label>
              <span>Preview All</span>
            </div>
            <div className="checkbox-row">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={hasSelection}
                  disabled={!hasSelection}
                  onChange={(e) => {
                    if (!e.target.checked) {
                      setSelectedClips(new Set())
                    }
                  }}
                />
                <span className="checkmark"></span>
              </label>
              <span>{selectedClips.size} selected</span>
            </div>
          </div>

          {/* Right end of the row, over the pane it controls. `.grid-checkboxes`
              is space-between, so this lands there on its own. */}
          <Tooltip content={previewCollapsed ? "Show preview panel" : "Hide preview panel"} placement="bottom-end">
            <button
              type="button"
              className={`import-button panel-toggle-button${previewCollapsed ? "" : " active"}`}
              onClick={() => setPreviewCollapsed(!previewCollapsed)}
              aria-label={previewCollapsed ? "Show preview panel" : "Hide preview panel"}
              aria-pressed={!previewCollapsed}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M15 3v18" />
                {!previewCollapsed && (
                  <rect x="15.9" y="4.9" width="4.2" height="14.2" rx="1" fill="currentColor" stroke="none" />
                )}
              </svg>
            </button>
          </Tooltip>
        </div>
      </main>
  )
}
