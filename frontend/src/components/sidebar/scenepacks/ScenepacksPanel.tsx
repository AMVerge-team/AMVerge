import type React from "react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  FaLayerGroup, FaFolderPlus, FaSortAlphaDown, FaSortAlphaUp,
  FaTrashAlt, FaPlay, FaSearch, FaTimes, FaSpinner,
} from "react-icons/fa";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import Tooltip from "../../common/Tooltip";
import { useScenepacksStore } from "../../../stores/scenepackStore";
import { countPendingForPack, useScenepackPendingStore } from "../../../stores/scenepackPendingStore";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
import { useUIStateStore } from "../../../stores/UIStore";
import type { ScenepackEntry, ScenepackFolder } from "../../../types/domain";

function useScenepackStructure(scenepacks: ScenepackEntry[], folders: ScenepackFolder[]) {
  return useMemo(() => {
    const folderById = new Map<string, ScenepackFolder>();
    const foldersByParentId = new Map<string | null, ScenepackFolder[]>();
    const scenepacksByFolderId = new Map<string, ScenepackEntry[]>();
    const rootScenepacks: ScenepackEntry[] = [];

    for (const f of folders) {
      folderById.set(f.id, f);
      const siblings = foldersByParentId.get(f.parentId) ?? [];
      siblings.push(f);
      foldersByParentId.set(f.parentId, siblings);
    }

    for (const sp of scenepacks) {
      if (sp.folderId && folderById.has(sp.folderId)) {
        const list = scenepacksByFolderId.get(sp.folderId) ?? [];
        list.push(sp);
        scenepacksByFolderId.set(sp.folderId, list);
      } else {
        rootScenepacks.push(sp);
      }
    }

    return { foldersByParentId, scenepacksByFolderId, rootScenepacks };
  }, [scenepacks, folders]);
}

export function ScenepacksPanel() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const clickGestureRef = useRef<{ key: string | null; ts: number }>({ key: null, ts: 0 });
  const [nextSortDirection, setNextSortDirection] = useState<"asc" | "desc">("asc");

  const setActivePage = useUIStateStore((s) => s.setActivePage);

  const {
    scenepacks,
    scenepackFolders,
    selectedScenepackId,
    selectedScenepackFolderId,
    openedScenepackId,
    setSelectedScenepackId,
    setSelectedScenepackFolderId,
    setOpenedScenepackId,
    addScenepack,
    removeScenepack,
    renameScenepack,
    addScenepackFolder,
    removeScenepackFolder,
    renameScenepackFolder,
    toggleScenepackFolderExpanded,
    sortScenepacks,
  } = useScenepacksStore();

  const { foldersByParentId, scenepacksByFolderId, rootScenepacks } =
    useScenepackStructure(scenepacks, scenepackFolders);

  // clips still being cut into a pack, so a row can say so while it happens
  const pending = useScenepackPendingStore((s) => s.pending);

  const [newItemModal, setNewItemModal] = useState<{ kind: "scenepack"; parentId: string | null } | { kind: "folder"; parentId: string | null } | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [modalFolderId, setModalFolderId] = useState<string | null>(null);
  const [renameModal, setRenameModal] = useState<{ id: string; kind: "scenepack" | "folder"; currentName: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; kind: "scenepack" | "folder"; x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "scenepack" | "folder"; id: string; name: string } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const handleSelectScenepack = useCallback((id: string) => {
    setSelectedScenepackId(id);
    setSelectedScenepackFolderId(null);
  }, [setSelectedScenepackId, setSelectedScenepackFolderId]);

  const handleOpenScenepack = useCallback((id: string) => {
    setOpenedScenepackId(id);
    setSelectedScenepackId(id);
    setSelectedScenepackFolderId(null);
    setActivePage("scenepacks");
  }, [setOpenedScenepackId, setSelectedScenepackId, setSelectedScenepackFolderId, setActivePage]);

  const handleSelectFolder = (id: string) => {
    setSelectedScenepackFolderId(id);
    setSelectedScenepackId(null);
  };

  const handleToggleFolder = (id: string) => {
    toggleScenepackFolderExpanded(id);
  };

  const handleSort = () => {
    const dir = nextSortDirection;
    sortScenepacks(dir);
    setNextSortDirection(dir === "asc" ? "desc" : "asc");
  };

  const handleCreateItem = () => {
    const name = newItemName.trim();
    if (!name || !newItemModal) return;
    if (newItemModal.kind === "scenepack") {
      const parentId = modalFolderId ?? newItemModal.parentId;
      const id = addScenepack(name, parentId);
      handleOpenScenepack(id);
    } else {
      const parentId = modalFolderId ?? newItemModal.parentId;
      addScenepackFolder(name, parentId);
    }
    setNewItemName("");
    setNewItemModal(null);
    setModalFolderId(null);
  };

  const handleRename = () => {
    const name = newItemName.trim();
    if (!name || !renameModal) return;
    if (renameModal.kind === "scenepack") {
      renameScenepack(renameModal.id, name);
    } else {
      renameScenepackFolder(renameModal.id, name);
    }
    setNewItemName("");
    setRenameModal(null);
  };

  const handleDeleteConfirmed = () => {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "scenepack") {
      removeScenepack(confirmDelete.id);
      invoke("delete_scenepack_storage", {
        scenepackId: confirmDelete.id,
        customPath: useGeneralSettingsStore.getState().episodesPath,
      }).catch((err) => console.error("Failed to delete Scenepack storage:", err));
    } else {
      removeScenepackFolder(confirmDelete.id);
    }
    setConfirmDelete(null);
  };

  const handleDeleteSelected = () => {
    if (selectedScenepackId) {
      const sp = scenepacks.find((s) => s.id === selectedScenepackId);
      if (sp) { setConfirmDelete({ kind: "scenepack", id: sp.id, name: sp.name }); return; }
    }
    if (selectedScenepackFolderId) {
      const f = scenepackFolders.find((f) => f.id === selectedScenepackFolderId);
      if (f) { setConfirmDelete({ kind: "folder", id: f.id, name: f.name }); }
    }
  };

  const DoubleClick = (key: string, onSingle: () => void, onDouble: () => void) => {
    return (_e: React.MouseEvent) => {
      const now = Date.now();
      const state = clickGestureRef.current;
      if (state.key === key && now - state.ts < 260) {
        clickGestureRef.current = { key: null, ts: 0 };
        onDouble();
        return;
      }
      clickGestureRef.current = { key, ts: now };
      onSingle();
    };
  };

  const sortLabel = nextSortDirection === "asc" ? "Sort A-Z" : "Sort Z-A";
  const SortIcon = nextSortDirection === "asc" ? FaSortAlphaDown : FaSortAlphaUp;

  const rootFolders = foldersByParentId.get(null) ?? [];

  const q = searchQuery.trim().toLowerCase();
  const filteredScenepacks = useMemo(() => {
    if (!q) return scenepacks;
    return scenepacks.filter((sp) => sp.name.toLowerCase().includes(q));
  }, [scenepacks, q]);
  const filteredFolders = useMemo(() => {
    if (!q) return scenepackFolders;
    return scenepackFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [scenepackFolders, q]);
  const filteredStructure = useScenepackStructure(filteredScenepacks, filteredFolders);

  const displayFolders = q ? filteredStructure.foldersByParentId : foldersByParentId;
  const displayScenepacksByFolder = q ? filteredStructure.scenepacksByFolderId : scenepacksByFolderId;
  const displayRootScenepacks = q ? filteredStructure.rootScenepacks : rootScenepacks;
  const displayRootFolders = displayFolders.get(null) ?? [];

  const renderScenepackRow = (sp: ScenepackEntry, depth: number, inFolder: boolean) => {
    const isSel = selectedScenepackId === sp.id;
    const isOpen = openedScenepackId === sp.id;
    const pendingCount = countPendingForPack(pending, sp.id);
    const paddingLeft = (inFolder ? 28 : 8) + depth * 12;

    return (
      <div
        key={sp.id}
        className={`episode-panel-row episode-row${isSel ? " is-selected" : ""}${isOpen ? " is-open" : ""}`}
        style={{ paddingLeft }}
        onClick={DoubleClick(`sp_${sp.id}`, () => handleSelectScenepack(sp.id), () => handleOpenScenepack(sp.id))}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ id: sp.id, kind: "scenepack", x: e.clientX, y: e.clientY });
        }}
      >
        {sp.clips.length > 0 && sp.clips[0].thumbnail ? (
          <img
            className="scenepack-thumbnail"
            src={convertFileSrc(sp.clips[0].thumbnail)}
            draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <FaLayerGroup className="episode-panel-import-icon" aria-hidden="true" />
        )}
        <span className="episode-panel-episode-name">{sp.name}</span>
        {pendingCount > 0 && (
          <Tooltip content={`Adding ${pendingCount} clip${pendingCount > 1 ? "s" : ""}…`} side="right">
            <FaSpinner className="scenepack-spinner scenepack-row-spinner" aria-hidden="true" />
          </Tooltip>
        )}
        <span className="episode-panel-count">{sp.clips.length}</span>
        {isOpen && <FaPlay className="episode-panel-import-icon" style={{ marginLeft: 4 }} />}
      </div>
    );
  };

  const renderFolder = (folder: ScenepackFolder, depth: number): React.ReactNode => {
    const children = displayFolders.get(folder.id) ?? [];
    const items = displayScenepacksByFolder.get(folder.id) ?? [];
    const isSel = selectedScenepackFolderId === folder.id;
    const paddingLeft = 8 + depth * 12;
    const isExpanded = q ? true : folder.isExpanded;

    return (
      <div key={folder.id} className="episode-panel-folder">
        <div
          className={`episode-panel-row folder-row${isSel ? " is-selected" : ""}`}
          style={{ paddingLeft }}
          onClick={q
            ? () => handleSelectFolder(folder.id)
            : DoubleClick(
              `folder_${folder.id}`,
              () => handleSelectFolder(folder.id),
              () => handleToggleFolder(folder.id)
            )
          }
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSelectFolder(folder.id);
            setContextMenu({ id: folder.id, kind: "folder", x: e.clientX, y: e.clientY });
          }}
        >
          <Tooltip content={isExpanded ? "Collapse folder" : "Expand folder"} side="right">
            <button
              type="button"
              className={`episode-panel-caret${isExpanded ? " is-expanded" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleToggleFolder(folder.id); }}
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
              tabIndex={-1}
            >
              ▸
            </button>
          </Tooltip>
          <span className="episode-panel-folder-name">{folder.name}</span>
        </div>
        {isExpanded && (children.length > 0 || items.length > 0) && (
          <div className="episode-panel-folder-children">
            {children.map((child) => renderFolder(child, depth + 1))}
            {items.map((sp) => renderScenepackRow(sp, depth + 1, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="eps-container">
      <div className="episode-panel">
        <div className="episode-panel-header">
          <div className="episode-panel-title">Scenepacks</div>
          <div className="episode-panel-actions">
            <Tooltip content={sortLabel}>
              <button type="button" className="episode-panel-action icon-only" onClick={handleSort} aria-label={sortLabel}>
                <SortIcon aria-hidden="true" />
              </button>
            </Tooltip>

            <Tooltip content="New folder">
              <button type="button" className="episode-panel-action icon-only"
                onClick={() => { setNewItemModal({ kind: "folder", parentId: null }); setNewItemName(""); setModalFolderId(null); }}
                aria-label="New folder">
                <FaFolderPlus aria-hidden="true" />
              </button>
            </Tooltip>

            <Tooltip content="New Scenepack">
              <button type="button" className="episode-panel-action icon-only"
                onClick={() => { setNewItemModal({ kind: "scenepack", parentId: selectedScenepackFolderId }); setNewItemName(""); setModalFolderId(selectedScenepackFolderId); }}
                aria-label="New Scenepack">
                <FaLayerGroup aria-hidden="true" />
              </button>
            </Tooltip>

            {/* wrapper span: disabled until something is selected */}
            <Tooltip content="Delete selected item">
              <span className="tooltip-anchor">
                <button type="button" className="episode-panel-action icon-only"
                  onClick={handleDeleteSelected}
                  disabled={!selectedScenepackId && !selectedScenepackFolderId}
                  aria-label="Delete selected">
                  <FaTrashAlt aria-hidden="true" />
                </button>
              </span>
            </Tooltip>
          </div>
        </div>

        <div className="scenepack-search">
          <FaSearch className="scenepack-search-icon" />
          <input
            type="text"
            className="scenepack-search-input"
            placeholder="Search Scenepacks..."
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

        <div
          className="episode-panel-list"
          tabIndex={0}
          ref={panelRef}
          onKeyDown={(e) => { if (e.key === "Delete") handleDeleteSelected(); }}
          onMouseDown={() => panelRef.current?.focus()}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedScenepackId(null);
              setSelectedScenepackFolderId(null);
            }
          }}
        >
          {displayRootFolders.map((folder) => renderFolder(folder, 0))}
          {displayRootScenepacks.map((sp) => renderScenepackRow(sp, 0, false))}
          {displayRootFolders.length === 0 && displayRootScenepacks.length === 0 && (
            <div className="scenepacks-empty-cta">
              <FaLayerGroup style={{ fontSize: 28, opacity: 0.3 }} />
              <span style={{ fontSize: 15, opacity: 0.6 }}>No Scenepacks yet</span>
              <span style={{ fontSize: 12, opacity: 0.4 }}>Group clips by character, fight, or event</span>
              <button
                className="episode-modal-btn primary"
                onClick={() => { setNewItemModal({ kind: "scenepack", parentId: null }); setNewItemName(""); setModalFolderId(null); }}
                style={{ marginTop: 8, fontSize: 14 }}
              >
                Create your first Scenepack
              </button>
            </div>
          )}
        </div>

        {newItemModal && (
          <div className="episode-modal-overlay" onClick={() => { setNewItemModal(null); setModalFolderId(null); }}>
            <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">
                {newItemModal.kind === "scenepack" ? "New Scenepack" : "New Folder"}
              </div>
              <input type="text" className="episode-modal-input"
                placeholder={newItemModal.kind === "scenepack" ? "Scenepack name..." : "Folder name..."}
                value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateItem(); }}
                autoFocus
              />
              {newItemModal.kind === "scenepack" && rootFolders.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div className="episode-context-menu-label">Category</div>
                  <div style={{ maxHeight: 140, overflowY: "auto" }}>
                    <div
                      className={`episode-panel-row folder-row${modalFolderId === null ? " is-selected" : ""}`}
                      onClick={() => setModalFolderId(null)}
                      style={{ padding: "6px 8px", cursor: "pointer", marginBottom: 1 }}
                    >
                      <span className="episode-panel-folder-name">None (root)</span>
                    </div>
                    {scenepackFolders.map((f) => (
                      <div key={f.id}
                        className={`episode-panel-row folder-row${modalFolderId === f.id ? " is-selected" : ""}`}
                        onClick={() => setModalFolderId(f.id)}
                        style={{ padding: "6px 8px", cursor: "pointer", marginBottom: 1 }}
                      >
                        <span className="episode-panel-folder-name">{f.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="episode-modal-actions">
                <button className="episode-modal-btn" onClick={() => { setNewItemModal(null); setModalFolderId(null); }}>Cancel</button>
                <button className="episode-modal-btn primary" onClick={handleCreateItem} disabled={!newItemName.trim()}>Create</button>
              </div>
            </div>
          </div>
        )}

        {renameModal && (
          <div className="episode-modal-overlay" onClick={() => setRenameModal(null)}>
            <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">Rename</div>
              <input type="text" className="episode-modal-input"
                placeholder="New name..."
                value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
                autoFocus
              />
              <div className="episode-modal-actions">
                <button className="episode-modal-btn" onClick={() => setRenameModal(null)}>Cancel</button>
                <button className="episode-modal-btn primary" onClick={handleRename} disabled={!newItemName.trim()}>Rename</button>
              </div>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="episode-modal-overlay" onClick={() => setConfirmDelete(null)}>
            <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">Delete {confirmDelete.kind === "scenepack" ? "Scenepack" : "Folder"}</div>
              <div className="episode-modal-message">
                Are you sure you want to delete "{confirmDelete.name}"?
              </div>
              {confirmDelete.kind === "folder" && (
                <div className="episode-modal-note">
                  All Scenepacks inside this folder will be moved to root.
                </div>
              )}
              <div className="episode-modal-actions">
                <button className="episode-modal-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="episode-modal-btn danger" onClick={handleDeleteConfirmed}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {contextMenu && (
          <div className="episode-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button className="episode-context-menu-item" onClick={() => {
              const currentName = contextMenu.kind === "scenepack"
                ? scenepacks.find((s) => s.id === contextMenu.id)?.name ?? ""
                : scenepackFolders.find((f) => f.id === contextMenu.id)?.name ?? "";
              setRenameModal({ id: contextMenu.id, kind: contextMenu.kind, currentName });
              setNewItemName(currentName);
              setContextMenu(null);
            }}>
              Rename
            </button>
            <button className="episode-context-menu-item" onClick={() => {
              const name = contextMenu.kind === "scenepack"
                ? scenepacks.find((s) => s.id === contextMenu.id)?.name ?? ""
                : scenepackFolders.find((f) => f.id === contextMenu.id)?.name ?? "";
              setConfirmDelete({ kind: contextMenu.kind, id: contextMenu.id, name });
              setContextMenu(null);
            }}>
              Delete
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
