import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { FaPlus } from '../icons/animated';

import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useUIStateStore } from "../../stores/UIStore";
import { setHeroFlip } from "../../features/sceneScout/heroTransition";
import { ScoutSearchField } from "./ScoutSearchField";
import { ScoutInfoButton } from "./ScoutInfoButton";
import { useAddEpisodes } from "./useAddEpisodes";
import { useCreateScoutDatabase } from "./useCreateScoutDatabase";
import { SceneScoutLogo } from "./SceneScoutLogo";
import { PreviewToggle, SidebarToggle } from "./PanelToggles";
import { ScoutModeTabs } from "./ScoutModeTabs";
import { AddEpisodeButton } from "./AddEpisodeButton";
import { FlowHeroClip } from "./flow/FlowHeroClip";

const MIWO_URL = "https://4miwo.carrd.co/";

/** the centered layout Scene Scout opens with each session, until the first search slides the bar up */
export function SceneScoutHero() {
  const { t } = useTranslation("scout");
  const databases = useSceneScoutStore((s) => s.databases);
  const loading = useSceneScoutStore((s) => s.loading);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const opened = useSceneScoutStore((s) => s.openedDatabase);
  const displayNames = useSceneScoutStore((s) => s.displayNames);
  const searching = useSceneScoutStore((s) => s.searching);
  const storeError = useSceneScoutStore((s) => s.error);
  const addToSearch = useSceneScoutStore((s) => s.addToSearch);
  const setActiveDatabase = useSceneScoutStore((s) => s.setActiveDatabase);
  const dismissHero = useSceneScoutStore((s) => s.dismissHero);
  const runSearch = useSceneScoutStore((s) => s.runSearch);
  const loadDatabases = useSceneScoutStore((s) => s.loadDatabases);
  const setTourSeen = useUIStateStore((s) => s.setSceneScoutTourSeen);
  // the centre holds the search bar on the Search tab and the clip player on the Flow tab
  const mode = useSceneScoutStore((s) => s.mode);

  // the list lives here too, so it fills even with the sidebar collapsed
  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  const fieldRef = useRef<HTMLDivElement>(null);
  const { startAddEpisodes, modal: addModal, error: addError } = useAddEpisodes();
  // a database made here is the one they want to fill and search next
  const { startCreate, modal: createModal, error: createError } = useCreateScoutDatabase((path) => {
    addToSearch([path]);
    setActiveDatabase(path);
  });

  const inSearch = (path: string) => selectedDatabases.some((p) => samePath(p, path));
  const labelFor = (path: string, fallback: string) => displayNames[path] ?? fallback;

  // add videos targets the active collection, falling back to the only collection so Add Videos isn't greyed out
  const addTarget =
    opened && inSearch(opened)
      ? opened
      : selectedDatabases.length > 0
        ? selectedDatabases[0]
        : databases.length === 1
          ? databases[0].path
          : null;
  const addTargetName = addTarget
    ? labelFor(addTarget, databases.find((d) => samePath(d.path, addTarget))?.name ?? t("hero.databaseFallback"))
    : null;

  const selectedHaveScenes = databases.some((d) => inSearch(d.path) && d.sceneCount > 0);
  // with nothing selected, searching asks which databases to use
  const blockedHint =
    databases.length === 0
      ? t("hero.blockedNoDatabase")
      : selectedDatabases.length > 0 && !selectedHaveScenes
        ? t("hero.blockedNoScenes")
        : null;

  const startFirstSearch = () => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (rect) setHeroFlip(rect);
    // the picker opens over the hero; the search it runs dismisses the hero then
    if (selectedDatabases.length > 0) dismissHero();
    void runSearch();
  };

  const onAddEpisodes = () => {
    if (!addTarget) return;
    setActiveDatabase(addTarget);
    void startAddEpisodes();
  };

  const anyHaveScenes = databases.some((d) => d.sceneCount > 0);
  const needsFirstCollection = databases.length === 0;
  const needsFirstVideos =
    !needsFirstCollection && !selectedHaveScenes && (!anyHaveScenes || selectedDatabases.length > 0);

  const error = addError || createError || storeError;

  return (
    <div className="scene-scout-hero">
      <div className="scene-scout-hero-inner">
        <div className="scene-scout-hero-logo-wrap">
          <SceneScoutLogo className="scene-scout-hero-logo" />
          <span className="scene-scout-logo-credit">
            Logo by:{" "}
            <button
              type="button"
              className="scene-scout-credit-link"
              onClick={() => void openUrl(MIWO_URL)}
            >
              Miwo
            </button>
          </span>
        </div>
        <p className="events-subtitle" style={{ margin: "-6px 0 10px", textAlign: "center", opacity: 0.7 }}>
          {mode === "flow" ? t("hero.subtitleFlow") : t("hero.subtitleSearch")}
        </p>

        {(needsFirstCollection || needsFirstVideos) && (
          <div className="scene-scout-hero-actions">
            <SidebarToggle />
            <ScoutInfoButton />
            <PreviewToggle />
          </div>
        )}

        {needsFirstCollection ? (
          <div className="scene-scout-hero-dbs" data-scout-tour="hero-dbs">
            <div
              className="scene-scout-hero-empty"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 14px" }}
            >
              <strong style={{ fontSize: 14, color: "rgba(255,255,255,0.92)" }}>
                1. Create your first collection
              </strong>
              <span style={{ maxWidth: 420, textAlign: "center", lineHeight: 1.45 }}>
                {loading ? t("hero.loadingDatabases") : t("hero.noDatabases")}
              </span>
              {!loading && (
                <button
                  type="button"
                  data-scout-tour="hero-create-btn"
                  className="event-host-btn"
                  style={{ fontSize: 12, padding: "8px 16px", marginTop: 2 }}
                  onClick={() => void startCreate()}
                >
                  <FaPlus aria-hidden="true" style={{ marginRight: 6 }} />
                  Create Collection
                </button>
              )}
            </div>
          </div>
        ) : needsFirstVideos ? (
          <>
            <div className="scene-scout-hero-dbs" data-scout-tour="hero-dbs">
              <div
                className="scene-scout-hero-empty"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 14px" }}
              >
                <strong style={{ fontSize: 14, color: "rgba(255,255,255,0.92)" }}>
                  2. Add videos to {addTargetName ?? t("hero.databaseFallback")}
                </strong>
                <span style={{ maxWidth: 440, textAlign: "center", lineHeight: 1.45 }}>
                  Add full anime episodes or pre-cut clip files to start searching.
                </span>
                <button
                  type="button"
                  data-scout-tour="hero-add-btn"
                  className="event-host-btn"
                  style={{ fontSize: 12, padding: "8px 16px", marginTop: 2 }}
                  onClick={onAddEpisodes}
                  disabled={!addTarget || searching}
                >
                  <FaPlus aria-hidden="true" style={{ marginRight: 6 }} />
                  Add Videos
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="scene-scout-hero-actions">
              <SidebarToggle />
              <AddEpisodeButton
                hint={addTargetName ? t("hero.addTo", { name: addTargetName }) : t("hero.addNoTarget")}
                onClick={onAddEpisodes}
                disabled={!addTarget || searching}
              />
              <ScoutModeTabs />
              <ScoutInfoButton />
              {/* far right, above the end of the search bar */}
              <PreviewToggle />
            </div>

            {mode === "flow" ? (
              <FlowHeroClip blockedHint={blockedHint} />
            ) : (
              <div className="scene-scout-hero-search">
                <ScoutSearchField fieldRef={fieldRef} onSubmit={startFirstSearch} blockedHint={blockedHint} />
              </div>
            )}

            <div
              className="scene-scout-hero-dbs"
              data-scout-tour="hero-dbs"
              style={{ maxHeight: 240, padding: "14px 16px", textAlign: "left" }}
            >
              <div className="scene-scout-hero-dbs-head">
                <span style={{ fontSize: 13, letterSpacing: "0.04em", color: "rgba(255,255,255,0.78)" }}>
                  How to use Scene Scout
                </span>
                <button
                  type="button"
                  className="scene-scout-hero-new"
                  onClick={() => setTourSeen(false)}
                >
                  Show walkthrough
                </button>
              </div>
              <div className="scene-scout-hero-guide-body">
                <p style={{ margin: 0 }}>
                  <b style={{ color: "rgba(255,255,255,0.94)" }}>What is a Collection?</b> A Collection is a local{" "}
                  <code>.scoutdb</code> index of your anime episodes or clips. Manage, check, or hide collections in the
                  left sidebar to choose what gets searched.
                </p>
                <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  <li>
                    <b style={{ color: "rgba(255,255,255,0.92)" }}>Create or open a collection</b> from the left sidebar.
                  </li>
                  <li>
                    <b style={{ color: "rgba(255,255,255,0.92)" }}>Add videos</b> (full episodes with AI/Keyframe
                    detection, or pre-cut clips with Skip detection).
                  </li>
                  <li>
                    <b style={{ color: "rgba(255,255,255,0.92)" }}>Search by description</b> (e.g.{" "}
                    <i>"character crying in the rain"</i>) or switch to <b>Match</b> to find visually similar clips
                    from a reference clip.
                  </li>
                  <li>
                    <b style={{ color: "rgba(255,255,255,0.92)" }}>Preview &amp; Export</b> any result from the right
                    panel.
                  </li>
                </ol>
              </div>
            </div>
          </>
        )}

        {error && (
          <p className="events-error scene-scout-hero-error" style={{ textAlign: "center", width: "100%" }}>
            {error}
          </p>
        )}

        {(needsFirstCollection || needsFirstVideos) && (
          <button
            type="button"
            className="event-host-btn"
            style={{
              marginTop: -4,
              alignSelf: "center",
              fontSize: 12,
              padding: "7px 14px",
              background: "rgba(255,255,255,0.06)",
              borderColor: "rgba(255,255,255,0.15)",
            }}
            onClick={() => setTourSeen(false)}
          >
            Show walkthrough
          </button>
        )}
      </div>

      {addModal}
      {createModal}
    </div>
  );
}

export default SceneScoutHero;
