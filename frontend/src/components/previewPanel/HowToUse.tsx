import { useMemo } from "react";
import { FaChevronDown, FaChevronUp, FaQuestionCircle, FaWindows, FaApple, FaLinux } from '../icons/animated';
import { Trans, useTranslation } from "react-i18next";

import Tooltip from "../common/Tooltip";
import { useUIStateStore } from "../../stores/UIStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

type Platform = "windows" | "mac" | "linux";
type Guide = "library" | "scenepacks" | "sceneScoutSearch" | "sceneScoutFlow";

function detectCurrentPlatform(): Platform {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent;
  if (/mac/i.test(ua)) return "mac";
  if (/linux/i.test(ua)) return "linux";
  return "windows";
}

const PLATFORM_INFO: Record<Platform, { label: string; icon: React.ReactNode; mod: string }> = {
  windows: { label: "Windows", icon: <FaWindows />, mod: "Ctrl" },
  linux: { label: "Linux", icon: <FaLinux />, mod: "Ctrl" },
  mac: { label: "macOS", icon: <FaApple />, mod: "Cmd" },
};

// translation keys under howToUse.steps; `mod` is filled with the platform's multi-select key
function steps(guide: Guide): string[] {
  switch (guide) {
    case "scenepacks":
      return [
        "scenepacks.create",
        "scenepacks.add",
        "scenepacks.open",
        "select",
        "exportNow",
      ];
    case "sceneScoutSearch":
      return [
        "sceneScoutSearch.database",
        "sceneScoutSearch.searching",
        "sceneScoutSearch.addEpisode",
        "sceneScoutSearch.describe",
        "sceneScoutSearch.preview",
        "exportNow",
      ];
    case "sceneScoutFlow":
      return [
        "sceneScoutFlow.import",
        "sceneScoutFlow.matches",
        "sceneScoutFlow.resize",
        "sceneScoutFlow.preview",
        "exportNow",
      ];
    default:
      return [
        "select",
        "library.focus",
        "library.profile",
        "library.start",
      ];
  }
}

export default function HowToUse() {
  const { t } = useTranslation("preview");
  const platform = useMemo(() => detectCurrentPlatform(), []);
  const currentInfo = PLATFORM_INFO[platform];

  // persisted, so a guide the user folded away stays folded across restarts
  const isExpanded = useUIStateStore((s) => s.howToUseExpanded);
  const setIsExpanded = useUIStateStore((s) => s.setHowToUseExpanded);
  const activePage = useUIStateStore((s) => s.activePage);
  const scoutMode = useSceneScoutStore((s) => s.mode);
  const setTourSeen = useUIStateStore((s) => s.setSceneScoutTourSeen);
  const setGettingStartedSeen = useUIStateStore((s) => s.setGettingStartedSeen);

  // the guide follows the page the preview pane sits beside
  const guide: Guide =
    activePage === "scenepacks"
      ? "scenepacks"
      : activePage === "sceneScout"
        ? scoutMode === "flow" ? "sceneScoutFlow" : "sceneScoutSearch"
        : "library";

  return (
    <div className={`info-panel ${isExpanded ? "expanded" : "collapsed"}`} data-getting-started="how-to-use">
      <div className="info-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="info-header-left">
          <FaQuestionCircle className="info-icon" />
          <span className="info-title">{t(`howToUse.titles.${guide}`)}</span>
        </div>
        <Tooltip content={isExpanded ? t("howToUse.hide") : t("howToUse.show")}>
          <button
            className="info-toggle"
            type="button"
            aria-label={isExpanded ? t("howToUse.hide") : t("howToUse.show")}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </Tooltip>
      </div>

      {isExpanded && (
        <div className="info-content">
          <div className="platform-switcher">
            <div className="platform-btn active" style={{ cursor: "default", justifyContent: "center" }}>
              {currentInfo.icon} {currentInfo.label}
            </div>
          </div>

          <div className="info-steps">
            <ul className="steps-list">
              {steps(guide).map((step, index) => (
                <li key={index}>
                  <span className="step-text">
                    <Trans
                      t={t}
                      i18nKey={`howToUse.steps.${step}`}
                      values={{ mod: platform === "mac" ? "Cmd" : "Ctrl" }}
                      components={{ b: <b /> }}
                    />
                  </span>
                </li>
              ))}
            </ul>
            {guide === "library" && (
              <button type="button" className="info-tour-link" onClick={() => setGettingStartedSeen(false)}>
                {t("gettingStarted:ariaLabel")}
              </button>
            )}
            {guide === "sceneScoutSearch" && (
              <button type="button" className="info-tour-link" onClick={() => setTourSeen(false)}>
                {t("howToUse.showTour")}
              </button>
            )}
            {guide === "sceneScoutFlow" && (
              <button type="button" className="info-tour-link" onClick={() => setTourSeen(false)}>
                {t("howToUse.showTour")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
