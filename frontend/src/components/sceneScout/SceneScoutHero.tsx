import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FaDatabase, FaPlus } from '../icons/animated';
import { FiDatabase } from '../icons/animated';

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
  const removeFromSearch = useSceneScoutStore((s) => s.removeFromSearch);
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

  const toggleDatabase = (path: string) => {
    if (inSearch(path)) {
      // keep the only database active so a stray click doesn't disable Add Episode and Search
      if (databases.length === 1 && selectedDatabases.length === 1) {
        setActiveDatabase(path);
        return;
      }
      removeFromSearch([path]);
      if (opened && samePath(opened, path)) {
        const next = selectedDatabases.find((p) => !samePath(p, path)) ?? null;
        setActiveDatabase(next);
      }
    } else {
      addToSearch([path]);
      setActiveDatabase(path);
    }
  };

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

  const needsFirstCollection = databases.length === 0;
  const needsFirstVideos = !needsFirstCollection && !selectedHaveScenes;

  const error = addError || createError || storeError;

  return (
    <div className="scene-scout-hero">
      <div className="scene-scout-hero-inner">
        <SceneScoutLogo className="scene-scout-hero-logo" />
        <p className="events-subtitle" style={{ margin: "-6px 0 10px", textAlign: "center", opacity: 0.7 }}>
          {mode === "flow" ? t("hero.subtitleFlow") : t("hero.subtitleSearch")}
        </p>

        {needsFirstCollection ? (
          <div className="scene-scout-hero-dbs" data-scout-tour="hero-dbs">
            <div
              className="scene-scout-hero-empty"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "22px 16px" }}
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
                  style={{ fontSize: 12, padding: "8px 16px", marginTop: 4 }}
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
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "20px 16px" }}
              >
                <strong style={{ fontSize: 14, color: "rgba(255,255,255,0.92)" }}>
                  2. Add videos to {addTargetName ?? t("hero.databaseFallback")}
                </strong>
                <span style={{ maxWidth: 440, textAlign: "center", lineHeight: 1.45 }}>
                  Add full anime episodes or pre-cut clip files (like flow clips or scenepacks) to start searching.
                </span>
                <button
                  type="button"
                  data-scout-tour="hero-add-btn"
                  className="event-host-btn"
                  style={{ fontSize: 12, padding: "8px 16px", marginTop: 4 }}
                  onClick={onAddEpisodes}
                  disabled={!addTarget || searching}
                >
                  <FaPlus aria-hidden="true" style={{ marginRight: 6 }} />
                  Add Videos
                </button>
              </div>
            </div>

            <div className="scene-scout-hero-dbs" style={{ marginTop: 10 }}>
              <div className="scene-scout-hero-dbs-head">
                <span>{t("hero.yourDatabases")}</span>
                <button type="button" className="scene-scout-hero-new" onClick={() => void startCreate()}>
                  <FaPlus aria-hidden="true" />
                  {t("hero.newDatabase")}
                </button>
              </div>
              <div className="scene-scout-hero-db-list">
                {databases.map((database) => {
                  const selected = inSearch(database.path);
                  const isTarget = addTarget !== null && samePath(addTarget, database.path);
                  return (
                    <button
                      key={database.path}
                      type="button"
                      className={`scene-scout-hero-db${selected ? " is-selected" : ""}${isTarget ? " is-target" : ""}`}
                      onClick={() => toggleDatabase(database.path)}
                      aria-pressed={selected}
                    >
                      {database.videoCount === 0 ? (
                        <FiDatabase className="scene-scout-hero-db-icon" aria-hidden="true" />
                      ) : (
                        <FaDatabase className="scene-scout-hero-db-icon" aria-hidden="true" />
                      )}
                      <span className="scene-scout-hero-db-name">{labelFor(database.path, database.name)}</span>
                      <span className="scene-scout-hero-db-count">
                        {database.sceneCount > 0 ? t("hero.sceneCount", { count: database.sceneCount }) : t("hero.empty")}
                      </span>
                    </button>
                  );
                })}
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

            <div className="scene-scout-hero-dbs" data-scout-tour="hero-dbs">
              <div className="scene-scout-hero-dbs-head">
                <span>{t("hero.yourDatabases")}</span>
                <button type="button" className="scene-scout-hero-new" onClick={() => void startCreate()}>
                  <FaPlus aria-hidden="true" />
                  {t("hero.newDatabase")}
                </button>
              </div>

              <div className="scene-scout-hero-db-list">
                {databases.map((database) => {
                  const selected = inSearch(database.path);
                  const isTarget = addTarget !== null && samePath(addTarget, database.path);
                  return (
                    <button
                      key={database.path}
                      type="button"
                      className={`scene-scout-hero-db${selected ? " is-selected" : ""}${isTarget ? " is-target" : ""}`}
                      onClick={() => toggleDatabase(database.path)}
                      aria-pressed={selected}
                    >
                      {database.videoCount === 0 ? (
                        <FiDatabase className="scene-scout-hero-db-icon" aria-hidden="true" />
                      ) : (
                        <FaDatabase className="scene-scout-hero-db-icon" aria-hidden="true" />
                      )}
                      <span className="scene-scout-hero-db-name">{labelFor(database.path, database.name)}</span>
                      <span className="scene-scout-hero-db-count">
                        {database.sceneCount > 0 ? t("hero.sceneCount", { count: database.sceneCount }) : t("hero.empty")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {error && <p className="events-error scene-scout-hero-error">{error}</p>}

        {(needsFirstCollection || needsFirstVideos) && (
          <button
            type="button"
            className="info-tour-link"
            style={{ marginTop: 12, alignSelf: "center" }}
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
