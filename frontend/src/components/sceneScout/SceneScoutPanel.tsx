import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { FaCheck, FaChevronRight, FaDatabase, FaEye, FaEyeSlash, FaPlus, FaSearch, FaSpinner, FaTimes, FaTrashAlt, FaVideo } from '../icons/animated';
import { FiDatabase } from '../icons/animated';
import { DatabaseImportIcon } from "../icons/ToolbarIcons";

import ModalShell from "../common/ModalShell";
import Tooltip from "../common/Tooltip";
import { useEscapeToClose } from "../common/useEscapeToClose";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useContextMenuStore } from "../../stores/contextMenuStore";
import type { ScoutDatabase, ScoutVideo } from "../../features/sceneScout/types";
import { useAddEpisodes } from "./useAddEpisodes";
import { useCreateScoutDatabase } from "./useCreateScoutDatabase";
import { EpisodeVisibilityPopover } from "./EpisodeVisibilityPopover";

const SONICFREAK_URL = "https://www.youtube.com/@sonicfreak1111";

type PanelMenu =
  | { kind: "db"; paths: string[]; x: number; y: number }
  | { kind: "video"; database: ScoutDatabase; videos: ScoutVideo[]; x: number; y: number }
  | { kind: "panel"; x: number; y: number };

/** sidebar panel for the databases and their episodes, on the same shell as the episode and Scenepacks panels */
export function SceneScoutPanel() {
  const databases = useSceneScoutStore((s) => s.databases);
  const opened = useSceneScoutStore((s) => s.openedDatabase);
  const videos = useSceneScoutStore((s) => s.videos);
  const videosByDatabase = useSceneScoutStore((s) => s.videosByDatabase);
  const expandedDatabases = useSceneScoutStore((s) => s.expandedDatabases);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const hiddenVideos = useSceneScoutStore((s) => s.hiddenVideos);
  const loading = useSceneScoutStore((s) => s.loading);
  const indexing = useSceneScoutStore((s) => s.indexing);
  const loadDatabases = useSceneScoutStore((s) => s.loadDatabases);
  const toggleDatabaseExpanded = useSceneScoutStore((s) => s.toggleDatabaseExpanded);
  const addToSearch = useSceneScoutStore((s) => s.addToSearch);
  const removeFromSearch = useSceneScoutStore((s) => s.removeFromSearch);
  const setActiveDatabase = useSceneScoutStore((s) => s.setActiveDatabase);
  const loadVideos = useSceneScoutStore((s) => s.loadVideos);
  const openExistingDatabase = useSceneScoutStore((s) => s.openExistingDatabase);
  const deleteDatabase = useSceneScoutStore((s) => s.deleteDatabase);
  const deleteVideo = useSceneScoutStore((s) => s.deleteVideo);
  const unloadDatabase = useSceneScoutStore((s) => s.unloadDatabase);
  const renameDatabase = useSceneScoutStore((s) => s.renameDatabase);
  const setVideosHidden = useSceneScoutStore((s) => s.setVideosHidden);
  const refresh = useSceneScoutStore((s) => s.refresh);
  const displayNames = useSceneScoutStore((s) => s.displayNames);

  const { startCreate, modal: createModal, error: createError } = useCreateScoutDatabase((path) => {
    addToSearch([path]);
    setActiveDatabase(path);
  });
  const { startAddEpisodes, modal: addModal, error: addError } = useAddEpisodes();
  const [panelError, setError] = useState("");
  const error = panelError || createError || addError;
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [databaseToDelete, setDatabaseToDelete] = useState<ScoutDatabase | null>(null);
  const [databaseToRename, setDatabaseToRename] = useState<ScoutDatabase | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [videosToDelete, setVideosToDelete] = useState<{ videos: ScoutVideo[]; database: ScoutDatabase } | null>(null);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [videosDeleted, setVideosDeleted] = useState(0);
  // explorer-style highlight for click, ctrl and shift; separate from which databases are searched
  const [highlightPaths, setHighlightPaths] = useState<string[]>([]);
  const [menu, setMenu] = useState<PanelMenu | null>(null);
  // highlighted episodes, for removing several at once; never changes what is searched
  const [picked, setPicked] = useState<{ database: string; paths: string[] }>({ database: "", paths: [] });
  // the searched database whose episode visibility popover is open, and its eye button
  const [visibilityFor, setVisibilityFor] = useState<{ database: ScoutDatabase; anchor: HTMLElement } | null>(null);

  // clicking anywhere but an episode row drops the highlight
  useEffect(() => {
    if (picked.paths.length === 0) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element).closest?.(".scout-video-row")) return;
      setPicked({ database: "", paths: [] });
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [picked.paths.length]);

  const pickVideo = (database: string, path: string, e: React.MouseEvent, order: string[]) => {
    setPicked((prev) => {
      const base = prev.database === database ? prev.paths : [];
      if (e.ctrlKey || e.metaKey) {
        const has = base.some((p) => samePath(p, path));
        return { database, paths: has ? base.filter((p) => !samePath(p, path)) : [...base, path] };
      }
      if (e.shiftKey && base.length) {
        const a = order.findIndex((p) => samePath(p, base[base.length - 1]));
        const b = order.findIndex((p) => samePath(p, path));
        if (a >= 0 && b >= 0) return { database, paths: order.slice(Math.min(a, b), Math.max(a, b) + 1) };
      }
      return { database, paths: [path] };
    });
  };

  const claimMenu = useContextMenuStore((s) => s.openContextMenu);
  const activeContextMenu = useContextMenuStore((s) => s.activeMenu);

  const labelFor = (path: string, fallback: string) => displayNames[path] ?? fallback;
  const inSearch = (path: string) => selectedDatabases.some((p) => samePath(p, path));
  const isHighlighted = (path: string) => highlightPaths.some((p) => samePath(p, path));
  const targetsFor = (path: string) => (isHighlighted(path) ? highlightPaths : [path]);

  const toggleSearch = (paths: string[], active: boolean) => {
    if (active) addToSearch(paths.filter((p) => !inSearch(p)));
    else removeFromSearch(paths);
  };

  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  // the eye on a searched database shows whether any of its episodes are hidden, which needs its episode list
  useEffect(() => {
    if (hiddenVideos.length === 0) return;
    for (const path of selectedDatabases) {
      if (!useSceneScoutStore.getState().videosByDatabase[path]) void loadVideos(path);
    }
  }, [hiddenVideos.length, selectedDatabases, loadVideos]);

  // another menu took the slot, so this one is stale
  useEffect(() => {
    if (activeContextMenu !== "scene-scout-database") setMenu(null);
  }, [activeContextMenu]);

  // contextmenu as well as click: a right-click fires no click event
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [menu]);

  useEscapeToClose(() => setMenu(null), menu !== null);

  // filters the panel's own lists, not scenes
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return databases;
    return databases.filter((database) =>
      labelFor(database.path, database.name).toLowerCase().includes(q)
    );
  }, [databases, searchQuery, displayNames]);

  const onRowClick = (path: string, order: string[]) => (e: React.MouseEvent) => {
    // the last clicked collection is where Add Videos indexes into
    setActiveDatabase(path);
    setHighlightPaths((prev) => {
      if (e.ctrlKey || e.metaKey) {
        const has = prev.some((p) => samePath(p, path));
        return has ? prev.filter((p) => !samePath(p, path)) : [...prev, path];
      }
      if (e.shiftKey && prev.length) {
        const anchor = prev[prev.length - 1];
        const a = order.findIndex((p) => samePath(p, anchor));
        const b = order.findIndex((p) => samePath(p, path));
        if (a >= 0 && b >= 0) {
          const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
          return [...range.filter((p) => !samePath(p, anchor)), anchor];
        }
      }
      return [path];
    });
  };

  const openMenu = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const paths = targetsFor(path);
    if (!isHighlighted(path)) setHighlightPaths([path]);
    claimMenu("scene-scout-database");
    setMenu({ kind: "db", paths, x: e.clientX, y: e.clientY });
  };

  const openVideoMenu = (database: ScoutDatabase, videosForMenu: ScoutVideo[]) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    claimMenu("scene-scout-database");
    setMenu({ kind: "video", database, videos: videosForMenu, x: e.clientX, y: e.clientY });
  };

  const openPanelMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    claimMenu("scene-scout-database");
    setMenu({ kind: "panel", x: e.clientX, y: e.clientY });
  };

  const revealPath = (targetPath: string) => {
    void invoke("reveal_in_file_manager", { filePath: targetPath }).catch((err) => {
      console.error("reveal_in_file_manager failed", err);
    });
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
      } else if (result.database?.path) {
        addToSearch([result.database.path]);
        setActiveDatabase(result.database.path);
      }
    } finally {
      setIsOpening(false);
      setOpeningName(null);
    }
  };

  // picking episodes only highlights them (e.g. to remove several); the eye decides what is searched
  const renderVideos = (database: ScoutDatabase) => {
    const dbVideos = videosByDatabase[database.path] ?? (samePath(opened, database.path) ? videos : []);
    const allDbVideoPaths = dbVideos.map((v) => v.filepath);
    const isIndexingVideo = (video: ScoutVideo) =>
      video.status === "indexing" || (indexing !== null && samePath(indexing.video, video.filepath));
    const isPicked = (video: ScoutVideo) =>
      samePath(picked.database, database.path) && picked.paths.some((p) => samePath(p, video.filepath));
    const pickedHere = dbVideos.filter((video) => isPicked(video) && !isIndexingVideo(video));
    return dbVideos.map((video) => {
      const isVideoSelected = isPicked(video);
      const isVideoIndexing = isIndexingVideo(video);
      const isHidden = hiddenVideos.some((h) => samePath(h, video.filepath));
      // a selected row's trash takes the whole selection in this database with it
      const deleteTargets = isVideoSelected && pickedHere.length > 1 ? pickedHere : [video];
      let videoRowClass = "episode-panel-row episode-row scout-video-row";
      if (isVideoSelected) videoRowClass += " is-focused is-selected";
      if (isHidden) videoRowClass += " is-search-hidden";

      return (
        <div
          key={video.id}
          className={videoRowClass}
          style={{ paddingLeft: "32px" }}
          title={isHidden ? "Hidden from searches" : undefined}
          onClick={(e) => {
            e.stopPropagation();
            pickVideo(database.path, video.filepath, e, allDbVideoPaths);
          }}
          onContextMenu={openVideoMenu(database, deleteTargets)}
        >
          <FaVideo className="episode-panel-import-icon scene-scout-row-icon" aria-hidden="true" />
          <span className="episode-panel-episode-name">{video.name}</span>
          <span className="episode-panel-count">
            {video.status === "indexing" ? "..." : video.sceneCount}
          </span>
          <Tooltip
            content={
              isVideoIndexing
                ? "Cannot delete while indexing"
                : deleteTargets.length > 1
                ? `Remove ${deleteTargets.length} videos from database`
                : "Remove video from database"
            }
          >
            <button
              type="button"
              className="episode-panel-import-icon episode-folder-btn episode-delete-btn"
              disabled={isVideoIndexing}
              onClick={(e) => {
                e.stopPropagation();
                setVideosToDelete({ videos: deleteTargets, database });
              }}
              aria-label={
                deleteTargets.length > 1
                  ? `Remove ${deleteTargets.length} videos from ${database.name}`
                  : `Remove ${video.name} from ${database.name}`
              }
            >
              <FaTrashAlt aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      );
    });
  };

  const renderDbRow = (database: ScoutDatabase, order: string[]) => {
    const path = database.path;
    const isExpanded = Boolean(expandedDatabases[path]);
    const lit = isHighlighted(path);
    const searched = inSearch(path);
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    let rowClass = "episode-panel-row episode-row scene-scout-db-row";
    if (lit) rowClass += highlightPaths.length > 1 ? " is-multi-selected is-selected" : " is-selected";
    if (isExpanded) rowClass += " is-open";
    if (searched) rowClass += " is-search-active";

    const hiddenHere = searched
      ? (videosByDatabase[path] ?? []).filter((v) => hiddenVideos.some((h) => samePath(h, v.filepath))).length
      : 0;

    return (
      <div key={path} className="episode-panel-folder">
        <div
          className={rowClass}
          onClick={onRowClick(path, order)}
          onDoubleClick={() => toggleSearch(targetsFor(path), !searched)}
          onContextMenu={openMenu(path)}
        >
          <button
            type="button"
            className={`episode-panel-caret${isExpanded ? " is-expanded" : ""}`}
            onDoubleClick={stop}
            onClick={(e) => {
              e.stopPropagation();
              void toggleDatabaseExpanded(path);
            }}
            aria-label={isExpanded ? "Collapse collection" : "Expand collection"}
          >
            <FaChevronRight className="episode-panel-caret-icon" />
          </button>
          <Tooltip content={searched ? "Included in search (click to exclude)" : "Excluded from search (click to include)"}>
            <button
              type="button"
              className={`scout-active-toggle${searched ? " is-active" : ""}`}
              onDoubleClick={stop}
              onClick={(e) => {
                e.stopPropagation();
                toggleSearch([path], !searched);
                if (!searched) setActiveDatabase(path);
              }}
              aria-label={searched ? `Stop searching ${database.name}` : `Search ${database.name}`}
              aria-pressed={searched}
            >
              {searched && <FaCheck aria-hidden="true" />}
            </button>
          </Tooltip>
          {database.videoCount === 0 ? (
            <FiDatabase className="episode-panel-import-icon scene-scout-row-icon" aria-hidden="true" />
          ) : (
            <FaDatabase className="episode-panel-import-icon scene-scout-row-icon" aria-hidden="true" />
          )}
          <span className="episode-panel-episode-name">{labelFor(path, database.name)}</span>
          <span className="episode-panel-count">{database.sceneCount}</span>
          {searched && (
            <Tooltip content={hiddenHere > 0 ? `${hiddenHere} episodes hidden from searches` : "Choose which episodes are searched"}>
              <button
                type="button"
                className={`episode-panel-import-icon episode-folder-btn scout-visibility-btn scout-row-hover-action${hiddenHere > 0 ? " has-hidden" : ""}`}
                onDoubleClick={stop}
                onClick={(e) => {
                  e.stopPropagation();
                  const anchor = e.currentTarget;
                  setVisibilityFor((current) =>
                    current && samePath(current.database.path, path) ? null : { database, anchor }
                  );
                }}
                aria-label={`Episodes searched in ${database.name}`}
              >
                {hiddenHere > 0 ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
              </button>
            </Tooltip>
          )}
          <Tooltip content="Delete collection from disk">
            <button
              type="button"
              className="episode-panel-import-icon episode-folder-btn episode-delete-btn scout-row-hover-action"
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
        </div>

        {isExpanded && (
          <div className="episode-panel-folder-children">{renderVideos(database)}</div>
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
            <span className="scene-scout-credit">
              By{" "}
              <button type="button" className="scene-scout-credit-link" onClick={() => void openUrl(SONICFREAK_URL)}>
                Mark Shun/Sonicfreak
              </button>
            </span>
          </div>
          <div className="episode-panel-actions" data-scout-tour="db-actions">
            <Tooltip content={isOpening ? "Opening collection…" : "Import a collection file (.scoutdb)"}>
              <button
                type="button"
                className="episode-panel-action icon-only"
                onClick={() => void startOpen()}
                disabled={isOpening}
                aria-label="Import a collection file"
              >
                {isOpening ? <FaSpinner className="spinner" aria-hidden="true" /> : <DatabaseImportIcon />}
              </button>
            </Tooltip>
            <Tooltip content="New collection">
              <button
                type="button"
                className="episode-panel-action icon-only"
                onClick={() => void startCreate()}
                aria-label="New collection"
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
            placeholder="Filter collections..."
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
        <div className="episode-panel-list" data-scout-tour="db-empty">
          {loading ? (
            <div className="scenepacks-empty-cta">
              <FaSpinner
                className="scenepack-spinner"
                style={{ fontSize: 24, opacity: 0.4 }}
                aria-hidden="true"
              />
              <span style={{ fontSize: 13, opacity: 0.5 }}>Loading collections...</span>
            </div>
          ) : (
            <div className="scenepacks-empty-cta">
              <FaDatabase style={{ fontSize: 28, opacity: 0.3 }} aria-hidden="true" />
              <span style={{ fontSize: 15, opacity: 0.6 }}>No collections yet</span>
              <button
                className="episode-modal-btn primary"
                onClick={() => void startCreate()}
                style={{ marginTop: 6, fontSize: 12, padding: "6px 12px" }}
              >
                Create a Collection
              </button>
            </div>
          )}
        </div>
        ) : (
        <div
          data-scout-tour="searching"
          className="episode-panel-list scene-scout-db-box"
          style={{ flex: 1, minHeight: 0 }}
          onContextMenu={openPanelMenu}
        >
          <div className="scene-scout-section-label">
            <span>Collections</span>
            <span className="scene-scout-section-count">
              Searching through: {selectedDatabases.length}/{databases.length}
            </span>
          </div>
          {isOpening && openingName && (
            <div className="episode-panel-row episode-row" style={{ opacity: 0.75, pointerEvents: "none" }}>
              <FaSpinner className="episode-panel-import-icon spinner" style={{ animation: "spin 1s linear infinite" }} />
              <span className="episode-panel-episode-name">Opening {openingName}…</span>
              <span className="episode-panel-count">loading</span>
            </div>
          )}
          {visible.length === 0 ? (
            <div className="episode-panel-empty">No collections match that search.</div>
          ) : (
            visible.map((database) => renderDbRow(database, visible.map((d) => d.path)))
          )}
        </div>
        )}
      </div>

      {visibilityFor && inSearch(visibilityFor.database.path) && (
        <EpisodeVisibilityPopover
          database={visibilityFor.database}
          anchor={visibilityFor.anchor}
          onClose={() => setVisibilityFor(null)}
        />
      )}

      {menu && (() => {
        const close = () => setMenu(null);
        const menuStyle = {
          left: Math.min(menu.x, window.innerWidth - 220),
          top: Math.min(menu.y, window.innerHeight - 240),
        };

        if (menu.kind === "panel") {
          return (
            <div
              className="episode-context-menu scene-scout-db-menu"
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="episode-context-menu-item"
                onClick={() => {
                  close();
                  void startCreate();
                }}
              >
                New Collection…
              </button>
              <button
                type="button"
                className="episode-context-menu-item"
                onClick={() => {
                  close();
                  void startOpen();
                }}
              >
                Import Collection (.scoutdb)…
              </button>
              <div className="episode-context-menu-separator" />
              <button
                type="button"
                className="episode-context-menu-item"
                onClick={() => {
                  close();
                  void refresh();
                }}
              >
                Refresh Collections
              </button>
            </div>
          );
        }

        if (menu.kind === "video") {
          const paths = menu.videos.map((v) => v.filepath);
          const allHidden = paths.every((p) => hiddenVideos.some((h) => samePath(h, p)));
          const singleVideo = menu.videos.length === 1 ? menu.videos[0] : null;
          return (
            <div
              className="episode-context-menu scene-scout-db-menu"
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="episode-context-menu-item"
                onClick={() => {
                  setVideosHidden(paths, !allHidden);
                  close();
                }}
              >
                {allHidden ? "Show in searches" : "Hide from searches"}
              </button>
              {singleVideo && (
                <button
                  type="button"
                  className="episode-context-menu-item"
                  onClick={() => {
                    revealPath(singleVideo.filepath);
                    close();
                  }}
                >
                  Reveal file in file manager
                </button>
              )}
              <div className="episode-context-menu-separator" />
              <button
                type="button"
                className="episode-context-menu-item scene-scout-menu-danger"
                onClick={() => {
                  setVideosToDelete({ videos: menu.videos, database: menu.database });
                  close();
                }}
              >
                {menu.videos.length > 1
                  ? `Remove ${menu.videos.length} videos from collection`
                  : "Remove from collection"}
              </button>
            </div>
          );
        }

        const n = menu.paths.length;
        const single = n === 1 ? databases.find((d) => samePath(d.path, menu.paths[0])) ?? null : null;
        const toAdd = menu.paths.filter((p) => !inSearch(p));
        const allActive = toAdd.length === 0;
        return (
          <div
            className="episode-context-menu scene-scout-db-menu"
            style={menuStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {single && (
              <button
                type="button"
                className="episode-context-menu-item"
                onClick={() => {
                  setActiveDatabase(single.path);
                  close();
                  void startAddEpisodes();
                }}
              >
                Add videos
              </button>
            )}
            <button
              type="button"
              className="episode-context-menu-item"
              onClick={() => {
                toggleSearch(menu.paths, !allActive);
                close();
              }}
            >
              {allActive
                ? n > 1
                  ? `Exclude ${n} collections from search`
                  : "Exclude from search"
                : n > 1
                  ? `Include ${n} collections in search`
                  : "Include in search"}
            </button>
            {single && (
              <>
                <button
                  type="button"
                  className="episode-context-menu-item"
                  onClick={() => {
                    setDatabaseToRename(single);
                    setRenameDraft(labelFor(single.path, single.name));
                    close();
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="episode-context-menu-item"
                  onClick={() => {
                    revealPath(single.path);
                    close();
                  }}
                >
                  Reveal in file manager
                </button>
              </>
            )}
            <div className="episode-context-menu-separator" />
            <button
              type="button"
              className="episode-context-menu-item"
              onClick={() => {
                menu.paths.forEach((p) => unloadDatabase(p));
                setHighlightPaths([]);
                close();
              }}
            >
              {n > 1 ? `Remove ${n} collections from list` : "Remove from list"}
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

      {createModal}
      {addModal}

      {databaseToRename && (
        <ModalShell
          open
          onClose={() => setDatabaseToRename(null)}
          label="Rename collection"
          className="scene-scout-name-modal"
        >
          <div className="denial-notice">
            <FaDatabase aria-hidden="true" className="denial-notice-icon" />
            <h2>Rename Collection</h2>
            <input
              autoFocus
              className="scene-scout-name-input"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameDraft.trim()) {
                  renameDatabase(databaseToRename.path, renameDraft.trim());
                  setDatabaseToRename(null);
                }
              }}
            />
            <div className="denial-notice-actions">
              <button
                type="button"
                className="event-host-btn"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                onClick={() => setDatabaseToRename(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="event-host-btn"
                disabled={!renameDraft.trim()}
                onClick={() => {
                  renameDatabase(databaseToRename.path, renameDraft.trim());
                  setDatabaseToRename(null);
                }}
              >
                Save
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
            <h2>Delete Collection from System?</h2>

            <p className="events-subtitle ban-notice-note scene-scout-delete-question" style={{ color: "rgba(255,255,255,0.85)" }}>
              Are you sure you want to permanently delete <strong>{databaseToDelete.name}</strong> from your system?
            </p>

            <div className="scene-scout-delete-details">
              <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>File path:</div>
              <div style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.9)" }}>{databaseToDelete.path}</div>
              <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.6)" }}>
                {databaseToDelete.videoCount} {databaseToDelete.videoCount === 1 ? "video" : "videos"} · {databaseToDelete.sceneCount} {databaseToDelete.sceneCount === 1 ? "scene" : "scenes"}
              </div>
            </div>

            <p className="scene-scout-delete-warning">
              This will permanently erase the collection file and its saved scene data from disk. This action cannot be undone. If you only want to remove it from this list, right-click it and choose Remove from list instead.
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

      {videosToDelete && (
        <ModalShell
          open
          onClose={() => !isDeletingVideo && setVideosToDelete(null)}
          label={videosToDelete.videos.length > 1 ? "Remove videos from database" : "Remove video from database"}
          className="scene-scout-delete-modal"
        >
          <div className="denial-notice">
            <FaTrashAlt aria-hidden="true" className="denial-notice-icon" style={{ color: "#ef4444" }} />
            <h2>{videosToDelete.videos.length > 1 ? `Remove ${videosToDelete.videos.length} Videos from Database?` : "Remove Video from Database?"}</h2>

            <p className="events-subtitle ban-notice-note scene-scout-delete-question" style={{ color: "rgba(255,255,255,0.85)" }}>
              Are you sure you want to remove{" "}
              <strong>
                {videosToDelete.videos.length > 1 ? `${videosToDelete.videos.length} videos` : videosToDelete.videos[0].name}
              </strong>{" "}
              from <strong>{videosToDelete.database.name}</strong>?
            </p>

            <div className="scene-scout-delete-details">
              {videosToDelete.videos.length > 1 ? (
                <div className="scene-scout-delete-list">
                  {videosToDelete.videos.map((video) => (
                    <div key={video.id} title={video.filepath}>{video.name}</div>
                  ))}
                </div>
              ) : (
                <>
                  <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>File path:</div>
                  <div style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.9)" }}>{videosToDelete.videos[0].filepath}</div>
                </>
              )}
              <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.6)" }}>
                {(() => {
                  const scenes = videosToDelete.videos.reduce((sum, video) => sum + video.sceneCount, 0);
                  return `${scenes} indexed ${scenes === 1 ? "scene" : "scenes"}`;
                })()}
              </div>
            </div>

            <p className="scene-scout-delete-warning">
              {videosToDelete.videos.length > 1
                ? "This will remove these videos and their saved scene data and thumbnails from this collection. The video files on your computer will NOT be deleted."
                : "This will remove this video and its saved scene data and thumbnails from this collection. The video file on your computer will NOT be deleted."}
            </p>

            <div className="denial-notice-actions">
              <button
                type="button"
                className="event-host-btn"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                onClick={() => setVideosToDelete(null)}
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
                  const target = videosToDelete;
                  setIsDeletingVideo(true);
                  setVideosDeleted(0);
                  try {
                    // one at a time: each is its own cli run against the same database file
                    for (const video of target.videos) {
                      await deleteVideo(target.database.path, video.id);
                      setVideosDeleted((count) => count + 1);
                    }
                    setVideosToDelete(null);
                  } finally {
                    setIsDeletingVideo(false);
                  }
                }}
              >
                {isDeletingVideo
                  ? videosToDelete.videos.length > 1
                    ? `Removing ${videosDeleted}/${videosToDelete.videos.length}...`
                    : "Removing..."
                  : videosToDelete.videos.length > 1
                  ? `Remove ${videosToDelete.videos.length} Videos`
                  : "Remove Video"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default SceneScoutPanel;
