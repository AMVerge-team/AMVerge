import Tooltip from "../common/Tooltip";
import { useSceneScoutStore, type ScoutMode } from "../../stores/sceneScoutStore";

const TABS: { mode: ScoutMode; label: string; hint: string }[] = [
  { mode: "search", label: "Search", hint: "Find scenes by describing them" },
  { mode: "flow", label: "Flow", hint: "Pick a clip and find scenes that look like they follow its last frame" },
];

/** Search and Flow are separate tools over the same databases, each with its own results */
export function ScoutModeTabs() {
  const mode = useSceneScoutStore((s) => s.mode);
  const setMode = useSceneScoutStore((s) => s.setMode);

  return (
    <div className="scene-scout-mode-tabs" data-scout-tour="mode-tabs" role="tablist" aria-label="Scene Scout mode">
      {TABS.map((tab) => (
        <Tooltip key={tab.mode} content={tab.hint}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === tab.mode}
            className={`scene-scout-mode-tab${mode === tab.mode ? " is-active" : ""}`}
            onClick={() => setMode(tab.mode)}
          >
            {tab.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
