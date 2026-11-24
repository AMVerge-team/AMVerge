import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaArrowLeft, FaSyncAlt } from '../icons/animated';

import Tooltip from "../common/Tooltip";
import PreviewAllToggle from "../common/PreviewAllToggle";
import { SelectionCount } from "../clipsGrid/SelectionCount";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import { AddEpisodeButton } from "./AddEpisodeButton";
import { heroFlipPending } from "../../features/sceneScout/heroTransition";
import { ScoutInfoButton } from "./ScoutInfoButton";
import { ScoutModeTabs } from "./ScoutModeTabs";
import { ScoutSettingsButton } from "./ScoutSettingsButton";
import { useAddEpisodes } from "./useAddEpisodes";
import { PreviewToggle, SidebarToggle, usePreviewPaneClearance } from "./PanelToggles";

/** the Search tab's toolbar (Add Episode, tabs, search settings), in place of home's import row */
export function SceneScoutToolbar() {
  const { t } = useTranslation("scout");
  const query = useSceneScoutStore((s) => s.query);
  const runSearch = useSceneScoutStore((s) => s.runSearch);
  const searching = useSceneScoutStore((s) => s.searching);
  const opened = useSceneScoutStore((s) => s.openedDatabase);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const databases = useSceneScoutStore((s) => s.databases);
  const displayNames = useSceneScoutStore((s) => s.displayNames);
  const refresh = useSceneScoutStore((s) => s.refresh);
  const showHero = useSceneScoutStore((s) => s.showHero);
  const loading = useSceneScoutStore((s) => s.loading);
  const storeError = useSceneScoutStore((s) => s.error);

  // padded so the row ends at the grid's edge instead of running under the preview pane
  const clearOfPreview = usePreviewPaneClearance();

  const noDatabaseOpen = !opened && selectedDatabases.length === 0;
  // same pick as addVideos: the last clicked database, else the first searched one
  const addTarget = opened || selectedDatabases[0] || null;
  const addTargetName = addTarget
    ? displayNames[addTarget] ?? databases.find((d) => samePath(d.path, addTarget))?.name ?? t("hero.databaseFallback")
    : null;
  const gateHint = t("toolbar.gateHint");

  const rerunSearch = () => {
    if (query.trim()) void runSearch();
  };

  const { startAddEpisodes, modal: addModal, error: addError } = useAddEpisodes();
  const error = addError;

  // coming from the first-visit layout, fade in its hidden controls (read before the search view uses the slide)
  const [revealed] = useState(heroFlipPending);

  return (
    <main className="clips-import grid-toolbar events-toolbar-shell scene-scout-toolbar-shell" style={clearOfPreview}>
      <div className="events-toolbar-rows">
        <div className="import-buttons-container events-toolbar-row">
          {/* first in the row, over the panel it controls, same as home and events */}
          <SidebarToggle />

          <Tooltip content="Back to Scene Scout home">
            <button
              type="button"
              className="import-button refresh-button"
              onClick={showHero}
              aria-label="Back to Scene Scout home"
            >
              <FaArrowLeft aria-hidden="true" />
            </button>
          </Tooltip>

          <AddEpisodeButton
            hint={addTargetName ? t("hero.addTo", { name: addTargetName }) : gateHint}
            onClick={() => void startAddEpisodes()}
            disabled={searching || noDatabaseOpen}
          />

          <ScoutModeTabs />
          <ScoutInfoButton />

          <Tooltip content={t("toolbar.refreshDatabases")}>
            <button
              type="button"
              className={`import-button refresh-button scene-scout-refresh-btn${revealed ? " scene-scout-reveal" : ""}`}
              onClick={() => void refresh()}
              disabled={loading}
              aria-label={t("toolbar.refreshDatabases")}
            >
              <FaSyncAlt aria-hidden="true" />
            </button>
          </Tooltip>

          <ScoutSettingsButton rerun={rerunSearch} className={revealed ? "scene-scout-reveal" : ""} />

          <PreviewAllToggle />
          <SelectionCount />

          {/* inline, so the row keeps home's height and the preview pane never shifts */}
          {(error || storeError) && (
            <Tooltip content={error || storeError}>
              <p className="events-error scene-scout-toolbar-error">{error || storeError}</p>
            </Tooltip>
          )}

          {/* last in the row, pushed over the preview pane it controls */}
          <PreviewToggle />
        </div>

        {addModal}
      </div>
    </main>
  );
}

export default SceneScoutToolbar;
