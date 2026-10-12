import { FaFolderOpen, FaSyncAlt } from "react-icons/fa";
import { open } from "@tauri-apps/plugin-dialog";

import Tooltip from "../../common/Tooltip";
import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { ScoutModeTabs } from "../ScoutModeTabs";
import { SidebarToggle } from "../PanelToggles";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "avi", "webm", "m4v"];

/** the Flow tab's row: pick the clip to continue, or re-run it against the current databases */
export function SceneScoutFlowToolbar() {
  const flowFrom = useSceneScoutStore((s) => s.flowFrom);
  const flowSearching = useSceneScoutStore((s) => s.flowSearching);
  const flowMeasuring = useSceneScoutStore((s) => s.flowMeasuring);
  const flowError = useSceneScoutStore((s) => s.flowError);
  const flowResults = useSceneScoutStore((s) => s.flowResults);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const startFlowSearch = useSceneScoutStore((s) => s.startFlowSearch);
  const runFlowSearch = useSceneScoutStore((s) => s.runFlowSearch);
  const clearFlow = useSceneScoutStore((s) => s.clearFlow);

  const busy = flowSearching || flowMeasuring;
  const noDatabase = selectedDatabases.length === 0;

  const pickClip = async () => {
    const picked = await open({ multiple: false, filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }] });
    if (typeof picked !== "string") return;
    void startFlowSearch({ path: picked, label: picked.split(/[/\\]/).pop() ?? picked });
  };

  const status = flowMeasuring
    ? "Reading your clip's motion…"
    : flowSearching
      ? "Finding scenes that continue it…"
      : flowFrom
        ? `${flowResults.length} scene${flowResults.length === 1 ? "" : "s"} continue this clip`
        : null;

  return (
    <main className="clips-import events-toolbar-shell scene-scout-toolbar-shell">
      <div className="events-toolbar-rows">
        <div className="import-buttons-container events-toolbar-row">
          <SidebarToggle />
          <ScoutModeTabs />

          <Tooltip content={noDatabase ? "Add a database to the Searching list on the left first" : "Pick the clip to continue"}>
            <button
              type="button"
              className="import-button events-action-button"
              onClick={() => void pickClip()}
              disabled={busy || noDatabase}
            >
              <FaFolderOpen aria-hidden="true" style={{ marginRight: 6 }} />
              Choose clip…
            </button>
          </Tooltip>

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

          {flowFrom && (
            <Tooltip content="Clear the clip and its results">
              <button type="button" className="import-button" onClick={clearFlow} disabled={busy}>
                Clear
              </button>
            </Tooltip>
          )}

          {status && <span className="scene-scout-flow-status">{status}</span>}
        </div>

        {flowError && <p className="events-error">{flowError}</p>}
      </div>
    </main>
  );
}
