// main Episode Panel coordinator. Wires together structure, menus, drag/drop, keyboard shortcuts, and UI sections.
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaSearch, FaTimes } from "react-icons/fa";

import EpisodePanelContextMenus from "./EpisodePanelContextMenus";
import EpisodePanelHeader from "./EpisodePanelHeader";
import EpisodePanelModals from "./EpisodePanelModals";
import EpisodePanelTree from "./EpisodePanelTree";

import useEpisodePanelDragDrop from "../hooks/useEpisodePanelDragDrop";
import useEpisodePanelMenus from "../hooks/useEpisodePanelMenus";
import useEpisodePanelStructure from "../hooks/useEpisodePanelStructure";
import useEpisodePanelState from "../../../hooks/useEpisodePanelState";

import { useEpisodePanelMetadataStore, useEpisodePanelRuntimeStore } from "../../../stores/episodeStore";

export default function EpisodePanel() {
  const panelListRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const clickGestureRef = useRef<{ key: string | null; ts: number }>({
    key: null,
    ts: 0,
  });
  const lastClickedEpisodeRef = useRef<string | null>(null);

  const [nextSortDirection, setNextSortDirection] = useState<"asc" | "desc">("asc");
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: "episode" | "episodes" | "folder";
    ids: string[];
    label: string;
  } | null>(null);

  const episodeRuntimeState = useEpisodePanelRuntimeStore();
  const episodeMetadataState = useEpisodePanelMetadataStore();

  const episodes = episodeRuntimeState.episodes;
  const episodeFolders = episodeMetadataState.episodeFolders;
  const selectedEpisodeId = episodeRuntimeState.selectedEpisodeId;
  const selectedFolderId = episodeRuntimeState.selectedFolderId;
  const openedEpisodeId = episodeRuntimeState.openedEpisodeId;
  const lastOpenedEpisodeId = episodeMetadataState.lastOpenedEpisodeId;

  const q = searchQuery.trim().toLowerCase();
  const filteredEpisodes = useMemo(() => {
    if (!q) return episodes;
    return episodes.filter((e) => e.displayName.toLowerCase().includes(q));
  }, [episodes, q]);
  const filteredFolders = useMemo(() => {
    if (!q) return episodeFolders;
    return episodeFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [episodeFolders, q]);
  const isSearching = q.length > 0;

  const {
    folderById,
    foldersByParentId,
    rootEpisodes,
    episodesByFolderId,
    flatEpisodeOrder,
  } = useEpisodePanelStructure({
    episodes: filteredEpisodes,
    episodeFolders: filteredFolders,
  });

  const clearClickGesture = () => {
    clickGestureRef.current = { key: null, ts: 0 };
  };

  const suppressNextClick = () => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleClickWithOptionalDouble = (opts: {
    key: string;
    onSingle: () => void;
    onDouble: () => void;
  }) => {
    return () => {
      if (suppressClickRef.current) return;

      const now = Date.now();
      const state = clickGestureRef.current;
      const isSecondClick = state.key === opts.key && now - state.ts < 260;

      if (isSecondClick) {
        clearClickGesture();
        opts.onDouble();
        return;
      }

      clickGestureRef.current = { key: opts.key, ts: now };
      opts.onSingle();
    };
  };

  const handleEpisodeClick = (episodeId: string) => (e: React.MouseEvent) => {
    if (suppressClickRef.current) return;

    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(episodeId)) next.delete(episodeId);
        else next.add(episodeId);
        return next;
      });
      lastClickedEpisodeRef.current = episodeId;
      return;
    }

    if (e.shiftKey && lastClickedEpisodeRef.current) {
      e.stopPropagation();
      const startIdx = flatEpisodeOrder.indexOf(lastClickedEpisodeRef.current);
      const endIdx = flatEpisodeOrder.indexOf(episodeId);

      if (startIdx >= 0 && endIdx >= 0) {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        setMultiSelectedIds(new Set(flatEpisodeOrder.slice(lo, hi + 1)));
      }

      return;
    }

    handleSelectEpisode(episodeId);
    setMultiSelectedIds(new Set());
    lastClickedEpisodeRef.current = episodeId;
  };

  const {
    handleSelectEpisode,
    handleOpenEpisode,
    handleSelectFolder,
    handleCreateFolder,
    handleRenameEpisode,
    handleRenameFolder,
    handleDeleteEpisode,
    handleDeleteFolder,
    handleSortEpisodePanel,
    handleMoveEpisodeToFolder,
    handleMoveEpisode,
    handleMoveFolder,
    handleToggleFolderExpanded,
  } = useEpisodePanelState();

  const confirmDeleteEpisode = (id: string) => {
    const ep = episodes.find((e) => e.id === id);
    setConfirmDelete({
      kind: "episode",
      ids: [id],
      label: ep?.displayName ?? ep?.id ?? "episode",
    });
  };

  const confirmDeleteEpisodes = (ids: string[]) => {
    setConfirmDelete({
      kind: "episodes",
      ids,
      label: `${ids.length} episodes`,
    });
  };

  const confirmDeleteFolder = (id: string) => {
    const f = episodeFolders.find((f) => f.id === id);
    setConfirmDelete({
      kind: "folder",
      ids: [id],
      label: f?.name ?? "folder",
    });
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "folder") {
      for (const id of confirmDelete.ids) handleDeleteFolder(id);
    } else {
      for (const id of confirmDelete.ids) void handleDeleteEpisode(id);
    }
    setConfirmDelete(null);
    setMultiSelectedIds(new Set());
  };

  useEffect(() => {
    if (openedEpisodeId) return;
    if (!lastOpenedEpisodeId) return;
    if (!episodes.some((episode) => episode.id === lastOpenedEpisodeId)) return;

    handleOpenEpisode(lastOpenedEpisodeId);
  }, [episodes, openedEpisodeId, lastOpenedEpisodeId, handleOpenEpisode]);

  const {
    contextMenu,
    setContextMenu,
    folderContextMenu,
    setFolderContextMenu,
    panelContextMenu,
    setPanelContextMenu,
    textModal,
    setTextModal,
    confirmModal,
    setConfirmModal,
    textModalInputRef,
    openContextMenu,
    openFolderContextMenu,
    openPanelContextMenu,
    openNewFolderModal,
    openRenameEpisodeModal,
    openRenameFolderModal,
    newFolderModal,
    newFolderName,
    setNewFolderName,
    newFolderParentId,
    setNewFolderParentId,
    closeNewFolderModal,
    handleCreateNewFolder,
  } = useEpisodePanelMenus({
    episodes,
    episodeFolders,
    multiSelectedIds,
    setMultiSelectedIds,
    clearClickGesture,
    onSelectEpisode: handleSelectEpisode,
    onSelectFolder: handleSelectFolder,
    onCreateFolder: handleCreateFolder,
    onRenameEpisode: handleRenameEpisode,
    onRenameFolder: handleRenameFolder,
  });

  const menusOpen =
    Boolean(contextMenu) ||
    Boolean(folderContextMenu) ||
    Boolean(panelContextMenu) ||
    Boolean(textModal) ||
    Boolean(confirmModal);

  const { dropTarget, beginPointerDrag } = useEpisodePanelDragDrop({
    folderById,
    foldersByParentId,
    episodesByFolderId,
    rootEpisodes,
    multiSelectedIds,
    setMultiSelectedIds,
    clearClickGesture,
    suppressNextClick,
    menusOpen,
    onMoveEpisode: handleMoveEpisode,
    onMoveFolder: handleMoveFolder,
  });

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "F2") {
      if (selectedEpisodeId) {
        e.preventDefault();
        openRenameEpisodeModal(selectedEpisodeId);
        return;
      }

      if (selectedFolderId) {
        e.preventDefault();
        openRenameFolderModal(selectedFolderId);
      }

      return;
    }

    if (e.key === "Delete") {
      if (multiSelectedIds.size > 0) {
        e.preventDefault();
        confirmDeleteEpisodes([...multiSelectedIds]);
        return;
      }

      if (selectedEpisodeId) {
        e.preventDefault();
        confirmDeleteEpisode(selectedEpisodeId);
        return;
      }

      if (selectedFolderId) {
        e.preventDefault();
        confirmDeleteFolder(selectedFolderId);
      }
    }
  };

  return (
    <div className="eps-container">
      <div className="episode-panel">
        <EpisodePanelHeader
          nextSortDirection={nextSortDirection}
          setNextSortDirection={setNextSortDirection}
          onSortEpisodePanel={handleSortEpisodePanel}
          openNewFolderModal={openNewFolderModal}
          selectedEpisodeId={selectedEpisodeId}
          selectedFolderId={selectedFolderId}
          multiSelectedCount={multiSelectedIds.size}
          onDeleteSelectedEpisode={() => {
            if (multiSelectedIds.size > 0) {
              confirmDeleteEpisodes([...multiSelectedIds]);
              return;
            }
            if (selectedEpisodeId) {
              confirmDeleteEpisode(selectedEpisodeId);
              return;
            }
            if (selectedFolderId) {
              confirmDeleteFolder(selectedFolderId);
            }
          }}
        />

        <div className="scenepack-search">
          <FaSearch className="scenepack-search-icon" />
          <input
            type="text"
            className="scenepack-search-input"
            placeholder="Search episodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="scenepack-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <FaTimes />
            </button>
          )}
        </div>

        <div
          className={
            dropTarget?.kind === "root"
              ? "episode-panel-list is-drop-target-root"
              : "episode-panel-list"
          }
          tabIndex={0}
          ref={panelListRef}
          onKeyDown={onPanelKeyDown}
          onMouseDown={() => panelListRef.current?.focus()}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleSelectFolder(null);
              setMultiSelectedIds(new Set());
            }
          }}
          onContextMenu={(e) => {
            if (e.target !== e.currentTarget) return;
            openPanelContextMenu(e);
          }}
          data-episode-panel-root="true"
        >
          <EpisodePanelTree
            rootEpisodes={rootEpisodes}
            foldersByParentId={foldersByParentId}
            episodesByFolderId={episodesByFolderId}
            dropTarget={dropTarget}
            openedEpisodeId={openedEpisodeId}
            selectedEpisodeId={selectedEpisodeId}
            selectedFolderId={selectedFolderId}
            multiSelectedIds={multiSelectedIds}
            beginPointerDrag={beginPointerDrag}
            handleEpisodeClick={handleEpisodeClick}
            handleClickWithOptionalDouble={handleClickWithOptionalDouble}
            openContextMenu={openContextMenu}
            openFolderContextMenu={openFolderContextMenu}
            onOpenEpisode={handleOpenEpisode}
            onSelectFolder={handleSelectFolder}
            onToggleFolderExpanded={handleToggleFolderExpanded}
            forceExpanded={isSearching}
          />
        </div>

        <EpisodePanelModals
          textModal={textModal}
          confirmModal={confirmModal}
          textModalInputRef={textModalInputRef}
          setTextModal={setTextModal}
          setConfirmModal={setConfirmModal}
          newFolderModal={newFolderModal}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          newFolderParentId={newFolderParentId}
          setNewFolderParentId={setNewFolderParentId}
          episodeFolders={episodeFolders}
          closeNewFolderModal={closeNewFolderModal}
          handleCreateNewFolder={handleCreateNewFolder}
        />

        {confirmDelete && (
          <div className="episode-modal-overlay" onClick={() => setConfirmDelete(null)}>
            <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">
                Delete {confirmDelete.kind === "folder" ? "Folder" : "Episode"}
              </div>
              <div className="episode-modal-message">
                Are you sure you want to delete "{confirmDelete.label}"?
              </div>
              <div className="episode-modal-note">
                This will also delete all cached clip files on disk.
              </div>
              <div className="episode-modal-actions">
                <button className="episode-modal-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="episode-modal-btn danger" onClick={handleConfirmDelete}>Delete</button>
              </div>
            </div>
          </div>
        )}

        <EpisodePanelContextMenus
          contextMenu={contextMenu}
          folderContextMenu={folderContextMenu}
          panelContextMenu={panelContextMenu}
          multiSelectedIds={multiSelectedIds}
          episodeFolders={episodeFolders}
          setContextMenu={setContextMenu}
          setFolderContextMenu={setFolderContextMenu}
          setPanelContextMenu={setPanelContextMenu}
          setMultiSelectedIds={setMultiSelectedIds}
          openNewFolderModal={openNewFolderModal}
          openRenameEpisodeModal={openRenameEpisodeModal}
          openRenameFolderModal={openRenameFolderModal}
          onDeleteEpisode={(id) => {
            if (multiSelectedIds.size > 1 && multiSelectedIds.has(id)) {
              confirmDeleteEpisodes([...multiSelectedIds]);
            } else {
              confirmDeleteEpisode(id);
            }
          }}
          onDeleteFolder={(id) => confirmDeleteFolder(id)}
          onMoveEpisodeToFolder={handleMoveEpisodeToFolder}
        />
      </div>
    </div>
  );
}