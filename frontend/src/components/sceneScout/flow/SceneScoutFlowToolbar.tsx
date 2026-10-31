import { FaSyncAlt } from "react-icons/fa";

import Tooltip from "../../common/Tooltip";
import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { pickFlowClip } from "../../../features/sceneScout/pickFlowClip";
import { ScoutModeTabs } from "../ScoutModeTabs";
import { ScoutInfoButton } from "../ScoutInfoButton";
import { ScoutSettingsButton } from "../ScoutSettingsButton";
import { PreviewToggle, SidebarToggle, usePreviewPaneClearance } from "../PanelToggles";

/** the Flow tab's row: pick the clip to continue, or re-run it against the current databases */
export function SceneScoutFlowToolbar() {
  const flowFrom = useSceneScoutStore((s) => s.flowFrom);
  const flowSearching = useSceneScoutStore((s) => s.flowSearching);
  const flowError = useSceneScoutStore((s) => s.flowError);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const startFlowSearch = useSceneScoutStore((s) => s.startFlowSearch);
  const runFlowSearch = useSceneScoutStore((s) => s.runFlowSearch);

  const busy = flowSearching;
  const noDatabase = selectedDatabases.length === 0;
  const clearOfPreview = usePreviewPaneClearance();

  const pickClip = async () => {
    const source = await pickFlowClip();
    if (source) void startFlowSearch(source);
  };

  return (
    <main className="clips-import grid-toolbar events-toolbar-shell scene-scout-toolbar-shell" style={clearOfPreview}>
      <div className="events-toolbar-rows">
        <div className="import-buttons-container events-toolbar-row">
          <SidebarToggle />

          {/* wrapper span: a disabled button fires no pointer events, so the tooltip listens on it instead */}
          <Tooltip content={noDatabase ? "Add a database to the Searching list on the left first" : "Input a file to find scene matches"}>
            <span className="tooltip-anchor">
              <button
                type="button"
                className="import-button icon-action-button import-text-button"
                onClick={() => void pickClip()}
                disabled={busy || noDatabase}
              >
                Import
              </button>
            </span>
          </Tooltip>

          <ScoutModeTabs />
          <ScoutInfoButton />

          <Tooltip content="Search again, e.g. after changing which databases are searched">
            <button
              type="button"
              className="import-button refresh-button"
              onClick={() => void runFlowSearch()}
              disabled={busy || !flowFrom}
              aria-label="Search again"
            >
              <FaSyncAlt aria-hidden="true" />
            </button>
          </Tooltip>

          <ScoutSettingsButton rerun={() => { if (flowFrom && !busy) void runFlowSearch(); }} />

          {/* inline, so the row keeps home's height and the preview pane never shifts */}
          {flowError && (
            <Tooltip content={flowError}>
              <p className="events-error scene-scout-toolbar-error">{flowError}</p>
            </Tooltip>
          )}

          {/* last in the row, over the preview pane it controls, same as the Search tab */}
          <PreviewToggle />
        </div>
      </div>
    </main>
  );
}
