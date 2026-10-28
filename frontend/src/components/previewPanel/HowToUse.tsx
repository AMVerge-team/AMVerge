import { useState } from "react";
import { FaChevronDown, FaChevronUp, FaQuestionCircle, FaWindows, FaApple } from "react-icons/fa";

import Tooltip from "../common/Tooltip";
import { useUIStateStore } from "../../stores/UIStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

type Platform = "windows" | "mac";
type Guide = "library" | "scenepacks" | "sceneScoutSearch" | "sceneScoutFlow";

const TITLES: Record<Guide, string> = {
  library: "HOW TO USE",
  scenepacks: "HOW TO USE SCENEPACKS",
  sceneScoutSearch: "HOW TO USE SCENE SCOUT",
  sceneScoutFlow: "HOW TO USE FLOW",
};

// `mod` is the multi-select key for the chosen platform
function steps(guide: Guide, mod: string): React.ReactNode[] {
  const select = <>Select clips with <b>{mod} + Click</b>, <b>Shift + Click</b>, or <b>Double Click</b></>;
  const exportNow = <>Click <b>Export Now</b> to export what you picked</>;

  switch (guide) {
    case "scenepacks":
      return [
        <>Create a Scenepack in the left panel</>,
        <>In the <b>Library</b>, select clips and click <b>Add to Scenepack</b></>,
        <>Open a Scenepack to see its clips</>,
        select,
        exportNow,
      ];
    case "sceneScoutSearch":
      return [
        <>Create or open a <b>Database</b> in the left panel</>,
        <>Click <b>Add Episode</b> to index episodes into it</>,
        <>Describe a scene in the search bar and press <b>Enter</b></>,
        <>Single click a result to <b>Preview</b> it</>,
        exportNow,
      ];
    case "sceneScoutFlow":
      return [
        <>Click <b>Input a file</b>, or select one clip and click <b>Find flowing clips</b></>,
        <>Matches are scenes that look like they continue from your clip's last frame</>,
        <>Drag the line between your clip and the matches to resize them</>,
        <>Single click a match to <b>Preview</b> it</>,
        exportNow,
      ];
    default:
      return [
        select,
        <>Single click to <b>Focus</b> a clip</>,
        <>Select <b>Export Profile</b> for export settings</>,
        <>Click <b>Export Now</b> to start the process</>,
      ];
  }
}

export default function HowToUse() {
  const [platform, setPlatform] = useState<Platform>("windows");
  // persisted, so a guide the user folded away stays folded across restarts
  const isExpanded = useUIStateStore((s) => s.howToUseExpanded);
  const setIsExpanded = useUIStateStore((s) => s.setHowToUseExpanded);
  const activePage = useUIStateStore((s) => s.activePage);
  const scoutMode = useSceneScoutStore((s) => s.mode);

  // the guide follows the page the preview pane sits beside
  const guide: Guide =
    activePage === "scenepacks"
      ? "scenepacks"
      : activePage === "sceneScout"
        ? scoutMode === "flow" ? "sceneScoutFlow" : "sceneScoutSearch"
        : "library";

  return (
    <div className={`info-panel ${isExpanded ? "expanded" : "collapsed"}`}>
      <div className="info-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="info-header-left">
          <FaQuestionCircle className="info-icon" />
          <span className="info-title">{TITLES[guide]}</span>
        </div>
        <Tooltip content={isExpanded ? "Hide the guide" : "Show the guide"}>
          <button
            className="info-toggle"
            type="button"
            aria-label={isExpanded ? "Hide the guide" : "Show the guide"}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </Tooltip>
      </div>

      {isExpanded && (
        <div className="info-content">
          <div className="platform-switcher">
            <button
              className={`platform-btn ${platform === "windows" ? "active" : ""}`}
              onClick={(e) => { e.stopPropagation(); setPlatform("windows"); }}
            >
              <FaWindows /> Windows
            </button>
            <button
              className={`platform-btn ${platform === "mac" ? "active" : ""}`}
              onClick={(e) => { e.stopPropagation(); setPlatform("mac"); }}
            >
              <FaApple /> macOS
            </button>
          </div>

          <div className="info-steps">
            <ul className="steps-list">
              {steps(guide, platform === "mac" ? "Cmd" : "Ctrl").map((step, index) => (
                <li key={index}>
                  <span className="step-text">{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
