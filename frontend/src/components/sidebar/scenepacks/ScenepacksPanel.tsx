import type React from "react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  FaLayerGroup, FaFolderPlus, FaSortAlphaDown, FaSortAlphaUp,
  FaTrashAlt, FaSearch, FaTimes, FaSpinner, FaFolderOpen,
} from "react-icons/fa";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import Tooltip from "../../common/Tooltip";
import { useScenepacksStore } from "../../../stores/scenepackStore";
import { countPendingForPack, useScenepackPendingStore } from "../../../stores/scenepackPendingStore";
import { revealScenepackStorage } from "../../../utils/scenepackStorage";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
import { useUIStateStore } from "../../../stores/UIStore";
import type { ScenepackEntry, ScenepackFolder } from "../../../types/domain";
import ScenepackThumbnailModal from "./ScenepackThumbnailModal";
import { useContextMenuStore } from "../../../stores/contextMenuStore";
import { scenepackCover, useScenepackStructure } from "./useScenepackStructure";
import { usePackDrag } from "./usePackDrag";
import {
  ConfirmDelete,
  DeleteItemModal,
  NewItemModal as NewItemModalView,
  NewItemModal as NewItemModalType,
  RenameItemModal,
  RenameModal,
} from "./ScenepackModals";
import {
  FolderContextMenu,
  ItemMenu,
  PanelContextMenu,
  PanelMenu,
  ScenepackContextMenu,
} from "./ScenepackContextMenus";

const DOUBLE_CLICK_MS = 260;
const ROW_INDENT_PX = 12;

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
    setScenepackThumbnail,
    addScenepackFolder,
    moveScenepackToFolder,
    removeScenepackFolder,
    renameScenepackFolder,
    toggleScenepackFolderExpanded,
    sortScenepacks,
  } = useScenepacksStore();

  const { foldersByParentId, scenepacksByFolderId, rootScenepacks } =
    useScenepackStructure(scenepacks, scenepackFolders);

  // clips still being cut into a pack, so a row can say so while it happens
  const pending = useScenepackPendingStore((s) => s.pending);

  const [newItemModal, setNewItemModal] = useState<NewItemModalType | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [modalFolderId, setModalFolderId] = useState<string | null>(null);
  const [renameModal, setRenameModal] = useState<RenameModal | null>(null);
  const [contextMenu, setContextMenu] = useState<ItemMenu | null>(null);
  // right-click on the panel's empty space, like the episode panel's
  const [panelContextMenu, setPanelContextMenu] = useState<PanelMenu | null>(null);
  const [thumbnailModal, setThumbnailModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);

  const claimMenu = useContextMenuStore((s) => s.openContextMenu);
  const activeContextMenu = useContextMenuStore((s) => s.activeMenu);

  const { dropTarget, beginPackDrag, suppressClickRef } = usePackDrag(moveScenepackToFolder);

  // another menu took the slot, so whatever this panel had open is stale
  useEffect(() => {
    if (activeContextMenu === "scenepack-panel-item" || activeContextMenu === "scenepack-panel-empty") {
      return;
    }
    setContextMenu(null);
    setPanelContextMenu(null);
  }, [activeContextMenu]);

  // contextmenu as well as click: a right-click fires no click event, so a menu
  // opened elsewhere would otherwise sit on screen next to this one
  useEffect(() => {
    if (!contextMenu && !panelContextMenu) return;
    const close = () => {
      setContextMenu(null);
      setPanelContextMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [contextMenu, panelContextMenu]);

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

  const handleSort = () => {
    const dir = nextSortDirection;
    sortScenepacks(dir);
    setNextSortDirection(dir === "asc" ? "desc" : "asc");
  };

  const handleCreateItem = () => {
    const name = newItemName.trim();
    if (!name || !newItemModal) return;
    const parentId = modalFolderId ?? newItemModal.parentId;
    if (newItemModal.kind === "scenepack") {
      handleOpenScenepack(addScenepack(name, parentId));
    } else {
      addScenepackFolder(name, parentId);
    }
    setNewItemName("");
    setNewItemModal(null);
    setModalFolderId(null);
  };

  const handleRename = () => {
    const name = newItemName.trim();
    if (!name || !renameModal) return;
    if (renameModal.kind === "scenepack") renameScenepack(renameModal.id, name);
    else renameScenepackFolder(renameModal.id, name);
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
      if (sp) {
        setConfirmDelete({ kind: "scenepack", id: sp.id, name: sp.name });
        return;
      }
    }
    if (selectedScenepackFolderId) {
      const f = scenepackFolders.find((f) => f.id === selectedScenepackFolderId);
      if (f) setConfirmDelete({ kind: "folder", id: f.id, name: f.name });
    }
  };

  const doubleClick = (key: string, onSingle: () => void, onDouble: () => void) => {
    return (_e: React.MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const now = Date.now();
      const state = clickGestureRef.current;
      if (state.key === key && now - state.ts < DOUBLE_CLICK_MS) {
        clickGestureRef.current = { key: null, ts: 0 };
        onDouble();
        return;
      }
      clickGestureRef.current = { key, ts: now };
      onSingle();
    };
  };

  const menuActions = {
    openScenepack: handleOpenScenepack,
    moveScenepackToFolder,
    setNewItemModal,
    setRenameModal,
    setConfirmDelete,
    setNewItemName,
    setModalFolderId,
    setThumbnailModal,
    close: () => setContextMenu(null),
  };

  const sortLabel = nextSortDirection === "asc" ? "Sort A-Z" : "Sort Z-A";
  const SortIcon = nextSortDirection === "asc" ? FaSortAlphaDown : FaSortAlphaUp;
  const rootFolders = foldersByParentId.get(null) ?? [];

  const q = searchQuery.trim().toLowerCase();
  const filteredScenepacks = useMemo(
    () => (q ? scenepacks.filter((sp) => sp.name.toLowerCase().includes(q)) : scenepacks),
    [scenepacks, q]
  );
  const filteredFolders = useMemo(
    () => (q ? scenepackFolders.filter((f) => f.name.toLowerCase().includes(q)) : scenepackFolders),
    [scenepackFolders, q]
  );
  const filteredStructure = useScenepackStructure(filteredScenepacks, filteredFolders);

  const displayFolders = q ? filteredStructure.foldersByParentId : foldersByParentId;
  const displayScenepacksByFolder = q ? filteredStructure.scenepacksByFolderId : scenepacksByFolderId;
  const displayRootScenepacks = q ? filteredStructure.rootScenepacks : rootScenepacks;
  const displayRootFolders = displayFolders.get(null) ?? [];

  const openItemMenu = (e: React.MouseEvent, id: string, kind: "scenepack" | "folder") => {
    e.preventDefault();
    e.stopPropagation();
    setPanelContextMenu(null);
    claimMenu("scenepack-panel-item");
    setContextMenu({ id, kind, x: e.clientX, y: e.clientY });
  };

  const renderScenepackRow = (sp: ScenepackEntry, depth: number, inFolder: boolean) => {
    const isSel = selectedScenepackId === sp.id;
    const isOpen = openedScenepackId === sp.id;
    const pendingCount = countPendingForPack(pending, sp.id);
    const cover = scenepackCover(sp);

    return (
      <div
        key={sp.id}
        className={`episode-panel-row episode-row${isSel ? " is-selected" : ""}${isOpen ? " is-open" : ""}`}
        style={{ paddingLeft: (inFolder ? 28 : 8) + depth * ROW_INDENT_PX }}
        data-scenepack-id={sp.id}
        data-scenepack-folder-of={sp.folderId ?? "root"}
        onPointerDown={beginPackDrag(sp.id)}
        onClick={doubleClick(
          `sp_${sp.id}`,
          () => handleSelectScenepack(sp.id),
          () => handleOpenScenepack(sp.id)
        )}
        onContextMenu={(e) => openItemMenu(e, sp.id, "scenepack")}
      >
        {cover ? (
          <img
            className="scenepack-thumbnail"
            src={convertFileSrc(cover)}
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
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
        <Tooltip
          content={sp.clips.length === 0 ? "Nothing stored yet" : "Show in File Explorer"}
          side="right"
        >
          <span className="tooltip-anchor">
            <button
              type="button"
              className="episode-panel-import-icon episode-folder-btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void revealScenepackStorage(sp);
              }}
              disabled={sp.clips.length === 0}
              aria-label="Show in File Explorer"
            >
              <FaFolderOpen />
            </button>
          </span>
        </Tooltip>
      </div>
    );
  };

  const renderFolder = (folder: ScenepackFolder, depth: number): React.ReactNode => {
    const children = displayFolders.get(folder.id) ?? [];
    const items = displayScenepacksByFolder.get(folder.id) ?? [];
    const isSel = selectedScenepackFolderId === folder.id;
    // a search shows every match, so folders cannot stay collapsed over one
    const isExpanded = q ? true : folder.isExpanded;

    return (
      <div key={folder.id} className="episode-panel-folder">
        <div
          className={`episode-panel-row folder-row${isSel ? " is-selected" : ""}${dropTarget === folder.id ? " is-drop-target" : ""}`}
          style={{ paddingLeft: 8 + depth * ROW_INDENT_PX }}
          data-scenepack-folder-id={folder.id}
          onClick={
            q
              ? () => handleSelectFolder(folder.id)
              : doubleClick(
                  `folder_${folder.id}`,
                  () => handleSelectFolder(folder.id),
                  () => toggleScenepackFolderExpanded(folder.id)
                )
          }
          onContextMenu={(e) => {
            handleSelectFolder(folder.id);
            openItemMenu(e, folder.id, "folder");
          }}
        >
          <Tooltip content={isExpanded ? "Collapse folder" : "Expand folder"} side="right">
            <button
              type="button"
              className={`episode-panel-caret${isExpanded ? " is-expanded" : ""}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                toggleScenepackFolderExpanded(folder.id);
              }}
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
              <button
                type="button"
                className="episode-panel-action icon-only"
                onClick={handleSort}
                aria-label={sortLabel}
              >
                <SortIcon aria-hidden="true" />
              </button>
            </Tooltip>

            <Tooltip content="New folder">
              <button
                type="button"
                className="episode-panel-action icon-only"
                onClick={() => {
                  setNewItemModal({ kind: "folder", parentId: null });
                  setNewItemName("");
                  setModalFolderId(null);
                }}
                aria-label="New folder"
              >
                <FaFolderPlus aria-hidden="true" />
              </button>
            </Tooltip>

            <Tooltip content="New Scenepack">
              <button
                type="button"
                className="episode-panel-action icon-only"
                onClick={() => {
                  setNewItemModal({ kind: "scenepack", parentId: selectedScenepackFolderId });
                  setNewItemName("");
                  setModalFolderId(selectedScenepackFolderId);
                }}
                aria-label="New Scenepack"
              >
                <FaLayerGroup aria-hidden="true" />
              </button>
            </Tooltip>

            {/* wrapper span: disabled until something is selected */}
            <Tooltip content="Delete selected item">
              <span className="tooltip-anchor">
                <button
                  type="button"
                  className="episode-panel-action icon-only"
                  onClick={handleDeleteSelected}
                  disabled={!selectedScenepackId && !selectedScenepackFolderId}
                  aria-label="Delete selected"
                >
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
          className={`episode-panel-list${dropTarget === "root" ? " is-drop-target-root" : ""}`}
          tabIndex={0}
          ref={panelRef}
          data-scenepacks-root="true"
          onKeyDown={(e) => {
            if (e.key === "Delete") handleDeleteSelected();
          }}
          onMouseDown={() => panelRef.current?.focus()}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedScenepackId(null);
              setSelectedScenepackFolderId(null);
            }
          }}
          onContextMenu={(e) => {
            // only the empty space below the rows: a row handles its own
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            setContextMenu(null);
            claimMenu("scenepack-panel-empty");
            setPanelContextMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          {displayRootFolders.map((folder) => renderFolder(folder, 0))}
          {displayRootScenepacks.map((sp) => renderScenepackRow(sp, 0, false))}
          {displayRootFolders.length === 0 && displayRootScenepacks.length === 0 && (
            <div className="scenepacks-empty-cta">
              <FaLayerGroup style={{ fontSize: 28, opacity: 0.3 }} />
              <span style={{ fontSize: 15, opacity: 0.6 }}>No Scenepacks yet</span>
              <span style={{ fontSize: 12, opacity: 0.4 }}>
                Group clips by character, fight, or event
              </span>
              <button
                className="episode-modal-btn primary"
                onClick={() => {
                  setNewItemModal({ kind: "scenepack", parentId: null });
                  setNewItemName("");
                  setModalFolderId(null);
                }}
                style={{ marginTop: 8, fontSize: 14 }}
              >
                Create your first Scenepack
              </button>
            </div>
          )}
        </div>

        {newItemModal && (
          <NewItemModalView
            modal={newItemModal}
            name={newItemName}
            folders={scenepackFolders}
            rootFolders={rootFolders}
            selectedFolderId={modalFolderId}
            onNameChange={setNewItemName}
            onFolderChange={setModalFolderId}
            onCreate={handleCreateItem}
            onClose={() => {
              setNewItemModal(null);
              setModalFolderId(null);
            }}
          />
        )}

        {thumbnailModal && (
          <ScenepackThumbnailModal
            scenepackId={thumbnailModal}
            currentThumbnail={scenepacks.find((sp) => sp.id === thumbnailModal)?.thumbnail ?? null}
            onClose={() => setThumbnailModal(null)}
            onSaved={(thumbnail) => setScenepackThumbnail(thumbnailModal, thumbnail)}
          />
        )}

        {renameModal && (
          <RenameItemModal
            name={newItemName}
            onNameChange={setNewItemName}
            onRename={handleRename}
            onClose={() => setRenameModal(null)}
          />
        )}

        {confirmDelete && (
          <DeleteItemModal
            target={confirmDelete}
            onConfirm={handleDeleteConfirmed}
            onClose={() => setConfirmDelete(null)}
          />
        )}

        {panelContextMenu && (
          <PanelContextMenu
            menu={panelContextMenu}
            actions={{
              setNewItemModal,
              setNewItemName,
              setModalFolderId,
              close: () => setPanelContextMenu(null),
            }}
          />
        )}

        {contextMenu?.kind === "scenepack" && (
          <ScenepackContextMenu
            menu={contextMenu}
            scenepacks={scenepacks}
            folders={scenepackFolders}
            actions={menuActions}
          />
        )}

        {contextMenu?.kind === "folder" && (
          <FolderContextMenu menu={contextMenu} folders={scenepackFolders} actions={menuActions} />
        )}
      </div>
    </div>
  );
}
