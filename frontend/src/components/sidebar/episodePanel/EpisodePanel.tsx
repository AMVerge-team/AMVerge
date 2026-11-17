// main Episode Panel coordinator. wires together structure, menus, drag/drop, keyboard shortcuts, and UI sections
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaSearch, FaTimes, FaVideo } from '../../icons/animated';
import { useEscapeToClose } from "../../common/useEscapeToClose";

import Tooltip from "../../common/Tooltip";
import EpisodePanelContextMenus from "./EpisodePanelContextMenus";
import EpisodePanelHeader from "./EpisodePanelHeader";
import EpisodePanelModals from "./EpisodePanelModals";
import EpisodePanelTree from "./EpisodePanelTree";

import useEpisodePanelDragDrop from "../hooks/useEpisodePanelDragDrop";
import useEpisodePanelMenus from "../hooks/useEpisodePanelMenus";
import useEpisodePanelStructure from "../hooks/useEpisodePanelStructure";
import useEpisodePanelState from "../../../hooks/useEpisodePanelState";
import useImportExport from "../../../hooks/useImportExport";

import { useEpisodePanelMetadataStore, useEpisodePanelRuntimeStore } from "../../../stores/episodeStore";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
import { invoke } from "@tauri-apps/api/core";
import {
  findDatabaseLinks,
  linksByEpisode,
  removeDatabaseLinks,
  type DatabaseLink,
} from "../../../features/sceneScout/databaseLinks";

export default function EpisodePanel() {
  const { t } = useTranslation("library");
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
    /** scene scout databases indexing these episodes; null while they are being checked */
    links: DatabaseLink[] | null;
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
  const isLibraryEmpty = episodes.length === 0 && episodeFolders.length === 0;

  const { onImportClick } = useImportExport();

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

  // the modal opens at once; the databases indexing these episodes fill in when checked
  const askDeleteEpisodes = (kind: "episode" | "episodes", ids: string[], label: string) => {
    setConfirmDelete({ kind, ids, label, links: null });
    void findDatabaseLinks(ids).then((links) =>
      setConfirmDelete((current) => (current?.ids === ids ? { ...current, links } : current))
    );
  };

  const confirmDeleteEpisode = (id: string) => {
    const ep = episodes.find((e) => e.id === id);
    askDeleteEpisodes("episode", [id], ep?.displayName ?? ep?.id ?? t("episodePanel.fallbackEpisode"));
  };

  const confirmDeleteEpisodes = (ids: string[]) => {
    askDeleteEpisodes("episodes", ids, t("episodePanel.episodeCount", { count: ids.length }));
  };

  const confirmDeleteFolder = (id: string) => {
    const f = episodeFolders.find((f) => f.id === id);
    setConfirmDelete({
      kind: "folder",
      ids: [id],
      label: f?.name ?? t("episodePanel.fallbackFolder"),
      links: [],
    });
  };

  useEscapeToClose(() => setConfirmDelete(null), confirmDelete !== null);

  const handleConfirmDelete = () => {
    if (!confirmDelete || confirmDelete.links === null) return;
    if (confirmDelete.kind === "folder") {
      for (const id of confirmDelete.ids) handleDeleteFolder(id);
    } else {
      for (const id of confirmDelete.ids) void handleDeleteEpisode(id);
      // their scenes leave the databases too, so searches stop finding them
      void removeDatabaseLinks(confirmDelete.links);
    }
    setConfirmDelete(null);
    setMultiSelectedIds(new Set());
  };

  const linkedEpisodes = confirmDelete?.links ? linksByEpisode(confirmDelete.links) : [];

  useEffect(() => {
    if (openedEpisodeId) return;
    if (!lastOpenedEpisodeId) return;
    if (!episodes.some((episode) => episode.id === lastOpenedEpisodeId)) return;

    handleOpenEpisode(lastOpenedEpisodeId);
  }, [episodes, openedEpisodeId, lastOpenedEpisodeId, handleOpenEpisode]);

  const handleRevealEpisode = async (episodeId: string) => {
    const ep = episodes.find((e) => e.id === episodeId);
    if (!ep) return;

    const episodesPath = useGeneralSettingsStore.getState().episodesPath;
    let baseStorage = episodesPath;
    if (!baseStorage) {
      try {
        baseStorage = await invoke<string>("get_default_episodes_dir");
      } catch {
      }
    }

    if (baseStorage) {
      const cleanBase = baseStorage.replace(/\\/g, "/").replace(/\/+$/, "");
      const directEpisodeFolder = `${cleanBase}/episodes_storage/${ep.id}`;
      try {
        await invoke("reveal_in_file_manager", { filePath: directEpisodeFolder });
        return;
      } catch {
        // fallback to clip paths or videoPath
      }
    }

    const firstClip = ep.clips?.[0];
    const samplePath = firstClip?.clipPath || firstClip?.src || firstClip?.thumbnail;

    if (samplePath && (samplePath.includes("/") || samplePath.includes("\\"))) {
      const parts = samplePath.replace(/\\/g, "/").split("/");
      parts.pop(); // remove clip file name to get episode folder directory
      const episodeDir = parts.join("/");
      try {
        await invoke("reveal_in_file_manager", { filePath: episodeDir });
        return;
      } catch (err) {
        console.warn("Could not reveal episode directory:", err);
      }
    }

    if (ep.videoPath) {
      try {
        await invoke("reveal_in_file_manager", { filePath: ep.videoPath });
      } catch (err) {
        console.warn("Could not reveal video path:", err);
      }
    }
  };

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
            placeholder={t("episodePanel.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <Tooltip content={t("episodePanel.clearSearch")}>
              <button
                className="scenepack-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label={t("episodePanel.clearSearch")}
              >
                <FaTimes />
              </button>
            </Tooltip>
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
            onRevealEpisode={handleRevealEpisode}
            onSelectFolder={handleSelectFolder}
            onToggleFolderExpanded={handleToggleFolderExpanded}
            forceExpanded={isSearching}
          />

          {isLibraryEmpty && (
            <div className="episode-panel-empty-cta">
              <FaVideo style={{ fontSize: 28, opacity: 0.3 }} />
              <span style={{ fontSize: 15, opacity: 0.6 }}>{t("episodePanel.empty.title")}</span>
              <span style={{ fontSize: 12, opacity: 0.4 }}>{t("episodePanel.empty.description")}</span>
              <button
                className="episode-modal-btn primary"
                onClick={() => void onImportClick()}
                style={{ marginTop: 8, fontSize: 14 }}
              >
                {t("episodePanel.empty.importFirst")}
              </button>
            </div>
          )}
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
                {confirmDelete.kind === "folder"
                  ? t("episodePanel.deleteConfirm.titleFolder")
                  : t("episodePanel.deleteConfirm.titleEpisode")}
              </div>
              {linkedEpisodes.length > 0 && (
                <div className="episode-modal-links">
                  <div className="episode-modal-message">{t("episodePanel.deleteConfirm.linkedIntro")}</div>
                  <ul className="episode-modal-link-list">
                    {linkedEpisodes.map((entry) => (
                      <li key={entry.episodeName} title={entry.episodeName}>
                        <span className="episode-modal-link-name">{entry.episodeName}</span>
                        <span className="episode-modal-link-dbs">{entry.databases.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="episode-modal-message">
                {confirmDelete.kind === "folder"
                  ? t("episodePanel.deleteConfirm.messageFolder")
                  : confirmDelete.kind === "episodes"
                    ? t("episodePanel.deleteConfirm.messageEpisodes")
                    : t("episodePanel.deleteConfirm.messageEpisode")}
              </div>
              <div className="episode-modal-subject" title={confirmDelete.label}>
                {confirmDelete.label}
              </div>
              <div className="episode-modal-note">
                {confirmDelete.links === null
                  ? t("episodePanel.deleteConfirm.checkingDatabases")
                  : linkedEpisodes.length > 0
                    ? t("episodePanel.deleteConfirm.noteLinked")
                    : t("episodePanel.deleteConfirm.note")}
              </div>
              <div className="episode-modal-actions">
                <button className="episode-modal-btn" onClick={() => setConfirmDelete(null)}>{t("common:cancel")}</button>
                <button
                  className="episode-modal-btn danger"
                  onClick={handleConfirmDelete}
                  disabled={confirmDelete.links === null}
                >
                  {t("common:delete")}
                </button>
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
          onRevealEpisode={handleRevealEpisode}
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