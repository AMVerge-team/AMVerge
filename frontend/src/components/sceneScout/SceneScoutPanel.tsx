import { useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  FaChevronRight,
  FaDatabase,
  FaFolderOpen,
  FaImage,
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
import { useContextMenuStore } from "../../stores/contextMenuStore";
import type { ScoutDatabase, ScoutVideo } from "../../features/sceneScout/types";
import { useScoutDbDrag, type ScoutList } from "./useScoutDbDrag";

type DbMenu = { list: ScoutList; paths: string[]; x: number; y: number };

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
  const selectVideo = useSceneScoutStore((s) => s.selectVideo);
  const addToSearch = useSceneScoutStore((s) => s.addToSearch);
  const removeFromSearch = useSceneScoutStore((s) => s.removeFromSearch);
  const setActiveDatabase = useSceneScoutStore((s) => s.setActiveDatabase);
  const loadVideos = useSceneScoutStore((s) => s.loadVideos);
  const splitPct = useSceneScoutStore((s) => s.panelSplitPct);
  const setPanelSplitPct = useSceneScoutStore((s) => s.setPanelSplitPct);
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
  // explorer-style highlight for click, ctrl and shift; separate from which databases are searched
  const [highlight, setHighlight] = useState<{ list: ScoutList; paths: string[] }>({ list: "all", paths: [] });
  const [menu, setMenu] = useState<DbMenu | null>(null);
  // the searching list expands on its own so opening a row there does not also open it below
  const [searchExpanded, setSearchExpanded] = useState<Record<string, boolean>>({});

  const claimMenu = useContextMenuStore((s) => s.openContextMenu);
  const activeContextMenu = useContextMenuStore((s) => s.activeMenu);

  const labelFor = (path: string, fallback: string) => displayNames[path] ?? fallback;
  const inSearch = (path: string) => selectedDatabases.some((p) => samePath(p, path));
  const isHighlighted = (list: ScoutList, path: string) =>
    highlight.list === list && highlight.paths.some((p) => samePath(p, path));
  // acts on the whole highlight when the row is part of it, else on that row alone
  const targetsFor = (list: ScoutList, path: string) => (isHighlighted(list, path) ? highlight.paths : [path]);

  const moveTo = (paths: string[], to: ScoutList) => {
    if (to === "search") addToSearch(paths.filter((p) => !inSearch(p)));
    else removeFromSearch(paths);
  };

  const { dropList, ghost, beginDrag, suppressClickRef } = useScoutDbDrag(moveTo);

  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  // another menu took the slot, so this one is stale
  useEffect(() => {
    if (activeContextMenu !== "scene-scout-database") setMenu(null);
  }, [activeContextMenu]);

  // contextmenu as well as click: a right-click fires no click event
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // filters the panel's own lists. unrelated to searching scenes, which is the
  // bar above the grid
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return databases;
    return databases.filter((database) =>
      labelFor(database.path, database.name).toLowerCase().includes(q)
    );
  }, [databases, searchQuery, displayNames]);

  // in the order they were added, which is the order they move up in
  const searchVisible = useMemo(
    () =>
      selectedDatabases
        .map((p) => visible.find((d) => samePath(d.path, p)))
        .filter((d): d is ScoutDatabase => Boolean(d)),
    [selectedDatabases, visible]
  );

  const onRowClick = (list: ScoutList, path: string, order: string[]) => (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // the last clicked database is where Add Episode indexes into
    setActiveDatabase(path);
    setHighlight((prev) => {
      const base = prev.list === list ? prev.paths : [];
      if (e.ctrlKey || e.metaKey) {
        const has = base.some((p) => samePath(p, path));
        return { list, paths: has ? base.filter((p) => !samePath(p, path)) : [...base, path] };
      }
      if (e.shiftKey && base.length) {
        const anchor = base[base.length - 1];
        const a = order.findIndex((p) => samePath(p, anchor));
        const b = order.findIndex((p) => samePath(p, path));
        if (a >= 0 && b >= 0) {
          const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
          // anchor stays last so the next shift-click ranges from the same row
          return { list, paths: [...range.filter((p) => !samePath(p, anchor)), anchor] };
        }
      }
      return { list, paths: [path] };
    });
  };

  const openMenu = (list: ScoutList, path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const paths = targetsFor(list, path);
    if (!isHighlighted(list, path)) setHighlight({ list, paths: [path] });
    claimMenu("scene-scout-database");
    setMenu({ list, paths, x: e.clientX, y: e.clientY });
  };

  const splitRef = useRef<HTMLDivElement>(null);

  // drag the handle between the two boxes to trade height between them
  const beginResize = (e: React.PointerEvent) => {
    if (e.button !== 0 || !splitRef.current) return;
    e.preventDefault();
    const rect = splitRef.current.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => setPanelSplitPct(((ev.clientY - rect.top) / rect.height) * 100);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("scene-scout-resizing");
    };
    document.body.classList.add("scene-scout-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const toggleSearchExpanded = (path: string) => {
    const opening = !searchExpanded[path];
    setSearchExpanded((prev) => ({ ...prev, [path]: opening }));
    if (opening && !videosByDatabase[path]) void loadVideos(path);
  };

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

  // episodes are only pickable in the searching list, where picking one narrows the search
  const renderVideos = (database: ScoutDatabase, pickable: boolean) => {
    const dbVideos = videosByDatabase[database.path] ?? (samePath(opened, database.path) ? videos : []);
    const allDbVideoPaths = dbVideos.map((v) => v.filepath);
    if (dbVideos.length === 0) {
      return (
        <div className="episode-panel-empty" style={{ paddingLeft: "32px" }}>
          Nothing indexed. Use Add Episode above the grid.
        </div>
      );
    }
    return dbVideos.map((video) => {
      const isVideoSelected = pickable && selectedVideos.some((vp) => samePath(vp, video.filepath));
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
            if (!pickable) return;
            if (e.ctrlKey || e.metaKey) {
              selectVideo(video.filepath, database.path, "toggle");
            } else if (e.shiftKey) {
              selectVideo(video.filepath, database.path, "range", allDbVideoPaths);
            } else {
              selectVideo(video.filepath, database.path, "single");
            }
          }}
        >
          <FaVideo className="episode-panel-import-icon" aria-hidden="true" />
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
    });
  };

  const renderDbRow = (database: ScoutDatabase, list: ScoutList, order: string[]) => {
    const path = database.path;
    const isExpanded = list === "search" ? Boolean(searchExpanded[path]) : Boolean(expandedDatabases[path]);
    const lit = isHighlighted(list, path);
    // stays in the full list while searched, greyed so it reads as already picked
    const searched = list === "all" && inSearch(path);
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    let rowClass = "episode-panel-row episode-row scene-scout-db-row";
    if (lit) rowClass += highlight.paths.length > 1 ? " is-multi-selected is-selected" : " is-selected";
    if (isExpanded) rowClass += " is-open";
    if (searched) rowClass += " is-in-search";

    return (
      <div key={path} className="episode-panel-folder">
        <div
          className={rowClass}
          title={searched ? "Already being searched" : undefined}
          onPointerDown={beginDrag(list, () => targetsFor(list, path))}
          onClick={onRowClick(list, path, order)}
          onDoubleClick={() => moveTo(targetsFor(list, path), list === "all" ? "search" : "all")}
          onContextMenu={openMenu(list, path)}
        >
          <button
            type="button"
            className={`episode-panel-caret${isExpanded ? " is-expanded" : ""}`}
            onPointerDown={stop}
            onDoubleClick={stop}
            onClick={(e) => {
              e.stopPropagation();
              if (list === "search") toggleSearchExpanded(path);
              else void toggleDatabaseExpanded(path);
            }}
            aria-label={isExpanded ? "Collapse database" : "Expand database"}
            style={{ marginRight: "6px" }}
          >
            <FaChevronRight className="episode-panel-caret-icon" />
          </button>
          <FaDatabase className="episode-panel-import-icon" aria-hidden="true" />
          <span className="episode-panel-episode-name">{labelFor(path, database.name)}</span>
          <span className="episode-panel-count">{database.sceneCount}</span>
          {list === "all" && (
            <>
              <Tooltip content="Generate missing thumbnails into database">
                <button
                  type="button"
                  className="episode-panel-import-icon episode-folder-btn"
                  disabled={generatingThumbsDb === path}
                  onPointerDown={stop}
                  onDoubleClick={stop}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleGenerateThumbnails(database);
                  }}
                  aria-label={`Generate missing thumbnails for ${database.name}`}
                >
                  {generatingThumbsDb === path ? (
                    <FaSpinner className="spinner" style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <FaImage aria-hidden="true" />
                  )}
                </button>
              </Tooltip>
              <Tooltip content="Delete database from disk">
                <button
                  type="button"
                  className="episode-panel-import-icon episode-folder-btn episode-delete-btn"
                  onPointerDown={stop}
                  onDoubleClick={stop}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDatabaseToDelete(database);
                  }}
                  aria-label={`Delete ${database.name}`}
                >
                  <FaTrashAlt aria-hidden="true" />
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {isExpanded && (
          <div className="episode-panel-folder-children">{renderVideos(database, list === "search")}</div>
        )}
      </div>
    );
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

        {databases.length === 0 ? (
        <div className="episode-panel-list">
          {loading ? (
            <div className="scenepacks-empty-cta">
              <FaSpinner
                className="scenepack-spinner"
                style={{ fontSize: 24, opacity: 0.4 }}
                aria-hidden="true"
              />
              <span style={{ fontSize: 13, opacity: 0.5 }}>Loading databases...</span>
            </div>
          ) : (
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
          )}
        </div>
        ) : (
        <div className="scene-scout-split" ref={splitRef}>
          <div
            data-scout-list="search"
            className={`episode-panel-list scene-scout-db-box${dropList === "search" ? " is-drop-target-root" : ""}`}
            style={{ flex: `0 0 calc(${splitPct}% - 5px)` }}
          >
            <div className="scene-scout-section-label">Searching · {selectedDatabases.length}</div>
            {searchVisible.length === 0 ? (
              <div className="scene-scout-drop-hint">
                {selectedDatabases.length === 0
                  ? "Double-click, drag or right-click a database below to search it"
                  : "No searched databases match that filter."}
              </div>
            ) : (
              searchVisible.map((database) => renderDbRow(database, "search", searchVisible.map((d) => d.path)))
            )}
          </div>

          <div
            className="scene-scout-split-handle"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize lists"
            onPointerDown={beginResize}
          />

          <div
            data-scout-list="all"
            className={`episode-panel-list scene-scout-db-box${dropList === "all" ? " is-drop-target-root" : ""}`}
          >
            <div className="scene-scout-section-label">All databases · {databases.length}</div>
            {isOpening && openingName && (
              <div className="episode-panel-row episode-row" style={{ opacity: 0.75, pointerEvents: "none" }}>
                <FaSpinner className="episode-panel-import-icon spinner" style={{ animation: "spin 1s linear infinite" }} />
                <span className="episode-panel-episode-name">Opening {openingName}…</span>
                <span className="episode-panel-count">loading</span>
              </div>
            )}
            {visible.length === 0 ? (
              // a search that matched nothing, which is not the same as having no databases at all
              <div className="episode-panel-empty">No databases match that search.</div>
            ) : (
              visible.map((database) => renderDbRow(database, "all", visible.map((d) => d.path)))
            )}
          </div>
        </div>
        )}
      </div>

      {menu && (() => {
        const n = menu.paths.length;
        const single = n === 1 ? databases.find((d) => samePath(d.path, menu.paths[0])) ?? null : null;
        const toAdd = menu.paths.filter((p) => !inSearch(p));
        const close = () => setMenu(null);
        return (
          <div
            className="episode-context-menu scene-scout-db-menu"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {menu.list === "all" ? (
              <button
                type="button"
                className="episode-context-menu-item"
                disabled={toAdd.length === 0}
                onClick={() => {
                  moveTo(toAdd, "search");
                  close();
                }}
              >
                {toAdd.length === 0 ? "Already selected" : toAdd.length > 1 ? `Select ${toAdd.length} databases` : "Select this database"}
              </button>
            ) : (
              <button
                type="button"
                className="episode-context-menu-item"
                onClick={() => {
                  moveTo(menu.paths, "all");
                  close();
                }}
              >
                {n > 1 ? `Deselect ${n} databases` : "Deselect this database"}
              </button>
            )}
            {single && (
              <button
                type="button"
                className="episode-context-menu-item"
                disabled={generatingThumbsDb === single.path}
                onClick={() => {
                  void handleGenerateThumbnails(single);
                  close();
                }}
              >
                Generate missing thumbnails
              </button>
            )}
            <div className="episode-context-menu-separator" />
            <button
              type="button"
              className="episode-context-menu-item"
              onClick={() => {
                menu.paths.forEach((p) => unloadDatabase(p));
                setHighlight({ list: menu.list, paths: [] });
                close();
              }}
            >
              {n > 1 ? `Remove ${n} databases from list` : "Remove from list"}
            </button>
            {single && (
              <button
                type="button"
                className="episode-context-menu-item scene-scout-menu-danger"
                onClick={() => {
                  setDatabaseToDelete(single);
                  close();
                }}
              >
                Delete from disk…
              </button>
            )}
          </div>
        );
      })()}

      {ghost && (
        <div className="scene-scout-drag-ghost" style={{ left: ghost.x + 14, top: ghost.y + 10 }}>
          {ghost.count > 1 ? `${ghost.count} databases` : "1 database"}
        </div>
      )}

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
              This will permanently erase the database file and its embeddings from disk. This action cannot be undone. If you only want to remove it from this list, right-click it and choose Remove from list instead.
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
