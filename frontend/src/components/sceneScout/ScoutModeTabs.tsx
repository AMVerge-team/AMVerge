import { useTranslation } from "react-i18next";
import Tooltip from "../common/Tooltip";
import { useSceneScoutStore, type ScoutMode } from "../../stores/sceneScoutStore";

const TABS: { mode: ScoutMode; labelKey: string; hintKey: string }[] = [
  { mode: "search", labelKey: "tabs.search", hintKey: "tabs.searchHint" },
  { mode: "flow", labelKey: "tabs.match", hintKey: "tabs.matchHint" },
];

/** Search and Flow are separate tools over the same databases, each with its own results */
export function ScoutModeTabs() {
  const { t } = useTranslation("scout");
  const mode = useSceneScoutStore((s) => s.mode);
  const setMode = useSceneScoutStore((s) => s.setMode);

  return (
    <div className="scene-scout-mode-tabs" data-scout-tour="mode-tabs" role="tablist" aria-label={t("tabs.ariaLabel")}>
      {TABS.map((tab) => (
        <Tooltip key={tab.mode} content={t(tab.hintKey)}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === tab.mode}
            className={`scene-scout-mode-tab${mode === tab.mode ? " is-active" : ""}`}
            onClick={() => setMode(tab.mode)}
          >
            {t(tab.labelKey)}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
