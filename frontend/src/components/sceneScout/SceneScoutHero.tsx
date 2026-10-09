import { useEffect, useRef } from "react";
import { FaDatabase, FaPlus } from "react-icons/fa";
import { FiDatabase } from "react-icons/fi";

import Tooltip from "../common/Tooltip";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import { setHeroFlip } from "../../features/sceneScout/heroTransition";
import { ScoutSearchField } from "./ScoutSearchField";
import { ScoutInfoButton } from "./ScoutInfoButton";
import { useAddEpisodes } from "./useAddEpisodes";
import { useCreateScoutDatabase } from "./useCreateScoutDatabase";
import { SceneScoutLogo } from "./SceneScoutLogo";

/**
 * the centered layout Scene Scout opens with, once per app session: pick or create a
 * database, index episodes, run the first search. that search slides the bar to the top
 */
export function SceneScoutHero() {
  const databases = useSceneScoutStore((s) => s.databases);
  const loading = useSceneScoutStore((s) => s.loading);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const opened = useSceneScoutStore((s) => s.openedDatabase);
  const displayNames = useSceneScoutStore((s) => s.displayNames);
  const indexing = useSceneScoutStore((s) => s.indexing);
  const searching = useSceneScoutStore((s) => s.searching);
  const storeError = useSceneScoutStore((s) => s.error);
  const addToSearch = useSceneScoutStore((s) => s.addToSearch);
  const removeFromSearch = useSceneScoutStore((s) => s.removeFromSearch);
  const setActiveDatabase = useSceneScoutStore((s) => s.setActiveDatabase);
  const dismissHero = useSceneScoutStore((s) => s.dismissHero);
  const runSearch = useSceneScoutStore((s) => s.runSearch);
  const loadDatabases = useSceneScoutStore((s) => s.loadDatabases);

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

  // add episode indexes into the active database, which here is always one the user selected
  const addTarget =
    opened && inSearch(opened) ? opened : selectedDatabases.length > 0 ? selectedDatabases[0] : null;
  const addTargetName = addTarget
    ? labelFor(addTarget, databases.find((d) => samePath(d.path, addTarget))?.name ?? "database")
    : null;

  const selectedHaveScenes = databases.some((d) => inSearch(d.path) && d.sceneCount > 0);
  const blockedHint =
    selectedDatabases.length === 0
      ? "Select a database below to search it..."
      : !selectedHaveScenes
        ? "Add episodes to the selected database before searching..."
        : null;

  const toggleDatabase = (path: string) => {
    if (inSearch(path)) {
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
    dismissHero();
    void runSearch();
  };

  const onAddEpisodes = () => {
    if (!addTarget) return;
    setActiveDatabase(addTarget);
    void startAddEpisodes();
  };

  const error = addError || createError || storeError;

  return (
    <div className="scene-scout-hero">
      <div className="scene-scout-hero-inner">
        <SceneScoutLogo className="scene-scout-hero-logo" />

        <div className="scene-scout-hero-actions">
          <Tooltip
            content={
              addTargetName ? `Index episodes into ${addTargetName}` : "Select or create a database below first"
            }
          >
            <button
              type="button"
              className="import-button events-action-button"
              onClick={onAddEpisodes}
              disabled={!addTarget || Boolean(indexing) || searching}
            >
              {indexing ? "Indexing..." : "Add Episode"}
            </button>
          </Tooltip>
          <ScoutInfoButton />
        </div>

        <div className="scene-scout-hero-search">
          <ScoutSearchField fieldRef={fieldRef} onSubmit={startFirstSearch} blockedHint={blockedHint} />
        </div>

        <div className="scene-scout-hero-dbs">
          <div className="scene-scout-hero-dbs-head">
            <span>Your databases</span>
            <button type="button" className="scene-scout-hero-new" onClick={() => void startCreate()}>
              <FaPlus aria-hidden="true" />
              New database
            </button>
          </div>

          {databases.length === 0 ? (
            <div className="scene-scout-hero-empty">
              {loading ? "Loading databases..." : "No databases yet. Create one to start indexing episodes."}
            </div>
          ) : (
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
                      {database.sceneCount > 0 ? `${database.sceneCount} scenes` : "empty"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="events-error scene-scout-hero-error">{error}</p>}
      </div>

      {addModal}
      {createModal}
    </div>
  );
}

export default SceneScoutHero;
