import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import {
  FaChevronRight,
  FaDatabase,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrashAlt,
  FaVideo,
} from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import Tooltip from "../common/Tooltip";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";

/**
 * Sidebar panel for Scene Scout: the search databases, and what is indexed into
 * whichever one is open.
 *
 * Built on the same `eps-container` / `episode-panel` shell the episode and
 * Scenepacks panels use, so the border, scrollbar, header and search field are
 * literally the same components rather than a lookalike. A row is an
 * `episode-panel-row episode-row`, which is what gives it the hover and
 * selected states for free.
 *
 * TODO(scene-scout): context menus (rename, reveal in explorer) and drag-drop of
 * a video onto a database. `components/sidebar/episodePanel/` is the reference.
 */
export function SceneScoutPanel() {
  const databases = useSceneScoutStore((s) => s.databases);
  const opened = useSceneScoutStore((s) => s.openedDatabase);
  const videos = useSceneScoutStore((s) => s.videos);
  const videosByDatabase = useSceneScoutStore((s) => s.videosByDatabase);
  const expandedDatabases = useSceneScoutStore((s) => s.expandedDatabases);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const selectedVideos = useSceneScoutStore((s) => s.selectedVideos);
  const loading = useSceneScoutStore((s) => s.loading);
  const loadDatabases = useSceneScoutStore((s) => s.loadDatabases);
  const openDatabase = useSceneScoutStore((s) => s.openDatabase);
  const toggleDatabaseExpanded = useSceneScoutStore((s) => s.toggleDatabaseExpanded);
  const selectDatabase = useSceneScoutStore((s) => s.selectDatabase);
  const selectVideo = useSceneScoutStore((s) => s.selectVideo);
  const createDatabase = useSceneScoutStore((s) => s.createDatabase);
  const deleteDatabase = useSceneScoutStore((s) => s.deleteDatabase);
  const renameDatabase = useSceneScoutStore((s) => s.renameDatabase);
  const displayNames = useSceneScoutStore((s) => s.displayNames);

  // set once a database file exists, so the modal names something real rather
  // than collecting a name for a file that may never be created
  const [namingPath, setNamingPath] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const labelFor = (path: string, fallback: string) => displayNames[path] ?? fallback;

  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  // filters the panel's own list. unrelated to searching scenes, which is the
  // bar above the grid
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return databases;
    return databases.filter((database) =>
      labelFor(database.path, database.name).toLowerCase().includes(q)
    );
  }, [databases, searchQuery, displayNames]);

  /** pick a location, create the file, then ask what to call it in the app */
  const startCreate = async () => {
    setError("");

    const picked = await save({
      title: "Create Scene Scout database",
      defaultPath: "My Series.scoutdb",
      filters: [{ name: "Scene Scout database", extensions: ["scoutdb"] }],
    });
    if (!picked) return;

    const result = await createDatabase(picked);
    if (!result.ok) {
      setError(result.message || "Could not create the database.");
      return;
    }

    // default the label to the file they just named, which is almost always
    // what they want it called
    const fileStem = picked.split(/[/\\]/).pop()?.replace(/\.scoutdb$/i, "") ?? "Database";
    setDraftName(fileStem);
    setNamingPath(picked);
  };

  const confirmName = () => {
    if (!namingPath) return;
    const name = draftName.trim();
    if (name) renameDatabase(namingPath, name);
    setNamingPath(null);
    void openDatabase(namingPath);
  };

  return (
    <div className="eps-container">
      <div className="episode-panel">
        <div className="episode-panel-header">
          <div className="episode-panel-title">
            Scene Scout
            {/* upstream author, credited where the feature actually lives */}
            <span className="scene-scout-credit">By Mark Shun/Sonicfreak</span>
          </div>
          <div className="episode-panel-actions">
            <Tooltip content="New database">
              <button
                type="button"
                className="episode-panel-action icon-only"
                onClick={() => void startCreate()}
                aria-label="New database"
              >
                <FaPlus aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="scenepack-search">
          <FaSearch className="scenepack-search-icon" />
          <input
            type="text"
            className="scenepack-search-input"
            placeholder="Search databases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <Tooltip content="Clear search">
              <button
                className="scenepack-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <FaTimes />
              </button>
            </Tooltip>
          )}
        </div>

        {error && <p className="events-error scene-scout-panel-error">{error}</p>}

        <div className="episode-panel-list">
          {loading && databases.length === 0 ? (
            <div className="scenepacks-empty-cta">
              <FaSpinner
                className="scenepack-spinner"
                style={{ fontSize: 24, opacity: 0.4 }}
                aria-hidden="true"
              />
              <span style={{ fontSize: 13, opacity: 0.5 }}>Loading databases...</span>
            </div>
          ) : databases.length === 0 ? (
            <div className="scenepacks-empty-cta">
              <FaDatabase style={{ fontSize: 28, opacity: 0.3 }} aria-hidden="true" />
              <span style={{ fontSize: 15, opacity: 0.6 }}>No databases yet</span>
              <span style={{ fontSize: 12, opacity: 0.4 }}>
                Index episodes, then search them by describing a scene
              </span>
              <button
                className="episode-modal-btn primary"
                onClick={() => void startCreate()}
                style={{ marginTop: 8, fontSize: 14 }}
              >
                Create your first Scene Scout Database
              </button>
            </div>
          ) : visible.length === 0 ? (
            // a search that matched nothing, which is not the same as having no
            // databases at all and must not offer to create the first one
            <div className="episode-panel-empty">No databases match that search.</div>
          ) : (
            visible.map((database) => {
              const isExpanded = Boolean(expandedDatabases[database.path]);
              const isSelected = selectedDatabases.some((p) => samePath(p, database.path));
              const isMultiSelected = isSelected && selectedDatabases.length > 1;
              const dbVideos = videosByDatabase[database.path] ?? (samePath(opened, database.path) ? videos : []);
              const allDbVideoPaths = dbVideos.map((v) => v.filepath);

              let rowClass = "episode-panel-row episode-row";
              if (isSelected) rowClass += isMultiSelected ? " is-multi-selected is-selected" : " is-selected";
              if (isExpanded) rowClass += " is-open";

              return (
                <div key={database.path} className="episode-panel-folder">
                  <div
                    className={rowClass}
                    onClick={(e) => {
                      const allVisiblePaths = visible.map((d) => d.path);
                      if (e.ctrlKey || e.metaKey) {
                        selectDatabase(database.path, "toggle");
                      } else if (e.shiftKey) {
                        selectDatabase(database.path, "range", allVisiblePaths);
                      } else {
                        selectDatabase(database.path, "single");
                      }
                    }}
                  >
                    <button
                      type="button"
                      className={`episode-panel-caret${isExpanded ? " is-expanded" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleDatabaseExpanded(database.path);
                      }}
                      aria-label={isExpanded ? "Collapse database" : "Expand database"}
                      style={{ marginRight: "6px" }}
                    >
                      <FaChevronRight className="episode-panel-caret-icon" />
                    </button>
                    <FaDatabase
                      className="episode-panel-import-icon"
                      aria-hidden="true"
                    />
                    <span className="episode-panel-episode-name">
                      {labelFor(database.path, database.name)}
                    </span>
                    <span className="episode-panel-count">{database.sceneCount}</span>
                    <Tooltip content="Delete database">
                      <button
                        type="button"
                        className="episode-panel-import-icon episode-folder-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteDatabase(database.path);
                        }}
                        aria-label={`Delete ${database.name}`}
                      >
                        <FaTrashAlt aria-hidden="true" />
                      </button>
                    </Tooltip>
                  </div>

                  {isExpanded && (
                    <div className="episode-panel-folder-children">
                      {dbVideos.length === 0 ? (
                        <div className="episode-panel-empty" style={{ paddingLeft: "32px" }}>
                          Nothing indexed. Use Add Episode above the grid.
                        </div>
                      ) : (
                        dbVideos.map((video) => {
                          const isVideoSelected = selectedVideos.some((vp) => samePath(vp, video.filepath));
                          let videoRowClass = "episode-panel-row episode-row";
                          if (isVideoSelected) videoRowClass += " is-focused is-selected";

                          return (
                            <div
                              key={video.id}
                              className={videoRowClass}
                              style={{ paddingLeft: "32px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (e.ctrlKey || e.metaKey) {
                                  selectVideo(video.filepath, database.path, "toggle");
                                } else if (e.shiftKey) {
                                  selectVideo(video.filepath, database.path, "range", allDbVideoPaths);
                                } else {
                                  selectVideo(video.filepath, database.path, "single");
                                }
                              }}
                            >
                              <FaVideo
                                className="episode-panel-import-icon"
                                aria-hidden="true"
                              />
                              <span className="episode-panel-episode-name">{video.name}</span>
                              <span className="episode-panel-count">
                                {video.status === "indexing" ? "..." : video.sceneCount}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {namingPath && (
        <ModalShell
          open
          onClose={confirmName}
          label="Name this database"
          className="scene-scout-name-modal"
        >
          <div className="denial-notice">
            <FaDatabase aria-hidden="true" className="denial-notice-icon" />
            <h2>Name this database</h2>

            <p className="events-subtitle ban-notice-note">
              This is only the label shown in the sidebar. The file keeps the name
              you gave it.
            </p>

            <input
              autoFocus
              className="scene-scout-name-input"
              value={draftName}
              placeholder="Database name"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmName();
              }}
            />

            <div className="denial-notice-actions">
              <button type="button" className="event-host-btn" onClick={confirmName}>
                Done
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default SceneScoutPanel;
