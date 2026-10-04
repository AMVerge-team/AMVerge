import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  FaChevronRight,
  FaDatabase,
  FaFolderOpen,
  FaImage,
  FaMinus,
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
import type { ScoutDatabase, ScoutVideo } from "../../features/sceneScout/types";

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
  const indexing = useSceneScoutStore((s) => s.indexing);
  const loadDatabases = useSceneScoutStore((s) => s.loadDatabases);
  const openDatabase = useSceneScoutStore((s) => s.openDatabase);
  const toggleDatabaseExpanded = useSceneScoutStore((s) => s.toggleDatabaseExpanded);
  const selectDatabase = useSceneScoutStore((s) => s.selectDatabase);
  const selectVideo = useSceneScoutStore((s) => s.selectVideo);
  const createDatabase = useSceneScoutStore((s) => s.createDatabase);
  const openExistingDatabase = useSceneScoutStore((s) => s.openExistingDatabase);
  const deleteDatabase = useSceneScoutStore((s) => s.deleteDatabase);
  const deleteVideo = useSceneScoutStore((s) => s.deleteVideo);
  const unloadDatabase = useSceneScoutStore((s) => s.unloadDatabase);
  const renameDatabase = useSceneScoutStore((s) => s.renameDatabase);
  const displayNames = useSceneScoutStore((s) => s.displayNames);
  const generateThumbnails = useSceneScoutStore((s) => s.generateThumbnails);

  const [namingPath, setNamingPath] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [databaseToDelete, setDatabaseToDelete] = useState<ScoutDatabase | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<{ video: ScoutVideo; database: ScoutDatabase } | null>(null);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [generatingThumbsDb, setGeneratingThumbsDb] = useState<string | null>(null);

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
    if (!result.ok || !result.path) {
      setError(result.message || "Could not create the database.");
      return;
    }

    // default the label to the file they just named, which is almost always
    // what they want it called. key by the cli's resolved path so the label
    // matches the entry in the database list
    const fileStem = result.path.split(/[/\\]/).pop()?.replace(/\.scoutdb$/i, "") ?? "Database";
    setDraftName(fileStem);
    setNamingPath(result.path);
  };

  const startOpen = async () => {
    setError("");

    const picked = await open({
      title: "Open Scene Scout Database",
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Scene Scout Database (*.scoutdb, *.db, *.scdb)",
          extensions: ["scoutdb", "db", "scdb"],
        },
        { name: "All Files (*.*)", extensions: ["*"] },
      ],
    });
    if (!picked || typeof picked !== "string") return;

    const name = picked.split(/[/\\]/).pop() || picked;
    setIsOpening(true);
    setOpeningName(name);
    try {
      const result = await openExistingDatabase(picked);
      if (!result.ok) {
        setError(result.message || "Could not open the database.");
      }
    } finally {
      setIsOpening(false);
      setOpeningName(null);
    }
  };

  const confirmName = () => {
    if (!namingPath) return;
    const name = draftName.trim();
    if (name) renameDatabase(namingPath, name);
    setNamingPath(null);
    void openDatabase(namingPath);
  };

  const handleGenerateThumbnails = async (database: ScoutDatabase) => {
    setError("");
    setGeneratingThumbsDb(database.path);
    try {
      const res = await generateThumbnails(database.path);
      if (!res.ok && res.message) {
        setError(res.message);
      }
    } finally {
      setGeneratingThumbsDb(null);
    }
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
            <Tooltip content={isOpening ? "Opening database…" : "Open database"}>
              <button
                type="button"
                className="episode-panel-action icon-only"
                onClick={() => void startOpen()}
                disabled={isOpening}
                aria-label="Open database"
              >
                {isOpening ? <FaSpinner className="spinner" aria-hidden="true" /> : <FaFolderOpen aria-hidden="true" />}
              </button>
            </Tooltip>
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
            <>
              {isOpening && openingName && (
                <div className="episode-panel-row episode-row" style={{ opacity: 0.75, pointerEvents: "none" }}>
                  <FaSpinner className="episode-panel-import-icon spinner" style={{ animation: "spin 1s linear infinite" }} />
                  <span className="episode-panel-episode-name">Opening {openingName}…</span>
                  <span className="episode-panel-count">loading</span>
                </div>
              )}
              {visible.map((database) => {
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
                    <Tooltip content="Generate missing thumbnails into database">
                      <button
                        type="button"
                        className="episode-panel-import-icon episode-folder-btn"
                        disabled={generatingThumbsDb === database.path}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleGenerateThumbnails(database);
                        }}
                        aria-label={`Generate missing thumbnails for ${database.name}`}
                      >
                        {generatingThumbsDb === database.path ? (
                          <FaSpinner className="spinner" style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <FaImage aria-hidden="true" />
                        )}
                      </button>
                    </Tooltip>
                    <Tooltip content="Unload database (remove from list)">
                      <button
                        type="button"
                        className="episode-panel-import-icon episode-folder-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          unloadDatabase(database.path);
                        }}
                        aria-label={`Unload ${database.name}`}
                      >
                        <FaMinus aria-hidden="true" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Delete database from disk">
                      <button
                        type="button"
                        className="episode-panel-import-icon episode-folder-btn episode-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDatabaseToDelete(database);
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
                          const isVideoIndexing = video.status === "indexing" || (indexing !== null && samePath(indexing.video, video.filepath));
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
                              <Tooltip content={isVideoIndexing ? "Cannot delete while indexing" : "Remove video from database"}>
                                <button
                                  type="button"
                                  className="episode-panel-import-icon episode-folder-btn episode-delete-btn"
                                  disabled={isVideoIndexing}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setVideoToDelete({ video, database });
                                  }}
                                  aria-label={`Remove ${video.name} from ${database.name}`}
                                >
                                  <FaTrashAlt aria-hidden="true" />
                                </button>
                              </Tooltip>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </>
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

      {databaseToDelete && (
        <ModalShell
          open
          onClose={() => setDatabaseToDelete(null)}
          label="Delete database"
          className="scene-scout-delete-modal"
        >
          <div className="denial-notice">
            <FaTrashAlt aria-hidden="true" className="denial-notice-icon" style={{ color: "#ef4444" }} />
            <h2>Delete Database from System?</h2>

            <p className="events-subtitle ban-notice-note" style={{ color: "rgba(255,255,255,0.85)" }}>
              Are you sure you want to permanently delete <strong>{databaseToDelete.name}</strong> from your system?
            </p>

            <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: "8px", padding: "10px 14px", margin: "12px 0", fontSize: "12px", textAlign: "left", wordBreak: "break-all" }}>
              <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>File path:</div>
              <div style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.9)" }}>{databaseToDelete.path}</div>
              <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.6)" }}>
                {databaseToDelete.videoCount} {databaseToDelete.videoCount === 1 ? "video" : "videos"} · {databaseToDelete.sceneCount} indexed {databaseToDelete.sceneCount === 1 ? "scene" : "scenes"}
              </div>
            </div>

            <p style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "12px", margin: "6px 0 16px" }}>
              This will permanently erase the database file and its embeddings from disk. This action cannot be undone. If you only want to remove it from this list, use the minus (-) button instead.
            </p>

            <div className="denial-notice-actions">
              <button
                type="button"
                className="event-host-btn"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                onClick={() => setDatabaseToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="event-host-btn"
                style={{ background: "#ef4444", borderColor: "#ef4444", color: "white" }}
                onClick={async () => {
                  const db = databaseToDelete;
                  setDatabaseToDelete(null);
                  await deleteDatabase(db.path);
                }}
              >
                Delete Database
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {videoToDelete && (
        <ModalShell
          open
          onClose={() => !isDeletingVideo && setVideoToDelete(null)}
          label="Remove video from database"
          className="scene-scout-delete-modal"
        >
          <div className="denial-notice">
            <FaTrashAlt aria-hidden="true" className="denial-notice-icon" style={{ color: "#ef4444" }} />
            <h2>Remove Video from Database?</h2>

            <p className="events-subtitle ban-notice-note" style={{ color: "rgba(255,255,255,0.85)" }}>
              Are you sure you want to remove <strong>{videoToDelete.video.name}</strong> from <strong>{videoToDelete.database.name}</strong>?
            </p>

            <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: "8px", padding: "10px 14px", margin: "12px 0", fontSize: "12px", textAlign: "left", wordBreak: "break-all" }}>
              <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>File path:</div>
              <div style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.9)" }}>{videoToDelete.video.filepath}</div>
              <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.6)" }}>
                {videoToDelete.video.sceneCount} indexed {videoToDelete.video.sceneCount === 1 ? "scene" : "scenes"}
              </div>
            </div>

            <p style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "12px", margin: "6px 0 16px" }}>
              This will remove the video entry and all its scene embeddings and thumbnails from this database. The video file on your computer will NOT be deleted.
            </p>

            <div className="denial-notice-actions">
              <button
                type="button"
                className="event-host-btn"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                onClick={() => setVideoToDelete(null)}
                disabled={isDeletingVideo}
              >
                Cancel
              </button>
              <button
                type="button"
                className="event-host-btn"
                style={{ background: "#ef4444", borderColor: "#ef4444", color: "white" }}
                disabled={isDeletingVideo}
                onClick={async () => {
                  const target = videoToDelete;
                  setIsDeletingVideo(true);
                  try {
                    await deleteVideo(target.database.path, target.video.id);
                    setVideoToDelete(null);
                  } finally {
                    setIsDeletingVideo(false);
                  }
                }}
              >
                {isDeletingVideo ? "Removing..." : "Remove Video"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default SceneScoutPanel;
