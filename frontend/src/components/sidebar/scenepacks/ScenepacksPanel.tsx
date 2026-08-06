import type React from "react";
import { useRef, useState, useMemo } from "react";
import { FaLayerGroup, FaFolderPlus, FaSortAlphaDown, FaSortAlphaUp, FaTrashAlt, FaFileExport } from "react-icons/fa";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useScenepacksStore } from "../../../stores/scenepackStore";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
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
    addScenepackFolder,
    removeScenepackFolder,
    toggleScenepackFolderExpanded,
    sortScenepacks,
  } = useScenepacksStore();

  const { foldersByParentId, scenepacksByFolderId, rootScenepacks } =
    useScenepackStructure(scenepacks, scenepackFolders);

  const [newItemModal, setNewItemModal] = useState<{ kind: "scenepack"; parentId: string | null } | { kind: "folder"; parentId: string | null } | null>(null);
  const [newItemName, setNewItemName] = useState("");

  const handleOpenScenepack = (id: string) => {
    setOpenedScenepackId(id);
  };

  const handleSelectScenepack = (id: string) => {
    setSelectedScenepackId(id);
    setSelectedScenepackFolderId(null);
  };

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
      addScenepack(name, newItemModal.parentId);
    } else {
      addScenepackFolder(name, newItemModal.parentId);
    }
    setNewItemName("");
    setNewItemModal(null);
  };

  const handleDeleteSelected = () => {
    if (selectedScenepackId) {
      removeScenepack(selectedScenepackId);
    } else if (selectedScenepackFolderId) {
      removeScenepackFolder(selectedScenepackFolderId);
    }
  };

  const handleBatchExport = async () => {
    const sp = scenepacks.find((s) => s.id === selectedScenepackId);
    if (!sp || sp.clips.length === 0) return;

    const settings = useGeneralSettingsStore.getState();
    const exportProfiles = settings.exportProfiles ?? [];
    const activeProfile = exportProfiles.find(
      (p) => p.id === settings.activeExportProfileId
    ) ?? exportProfiles[0];
    const format = activeProfile?.container ?? "mp4";
    const defaultPath = `${sp.name}.${format}`;

    try {
      const savePath = await save({
        defaultPath,
        filters: [{ name: "Video", extensions: [format] }],
      });
      if (!savePath) return;

      const exportSpecs = sp.clips.map((c) => ({
        input: c.clipPath ?? c.input,
        start_sec: c.clipPath ? undefined : c.startSec,
        end_sec: c.clipPath ? undefined : c.endSec,
      }));

      const exportOptions = {
        profileId: activeProfile?.id ?? "",
        workflow: activeProfile?.workflow ?? "video_encode",
        editorTarget: activeProfile?.editorTarget ?? "",
        codec: activeProfile?.codec ?? "libx264",
        audioMode: activeProfile?.audioMode ?? "copy",
        hardwareMode: activeProfile?.hardwareMode ?? "auto",
        parallelExports: activeProfile?.parallelExports ?? 4,
      };

      const exportedFiles = await invoke<string[]>("export_clips", {
        clips: exportSpecs,
        savePath,
        mergeEnabled: true,
        exportOptions,
      });

      if (exportedFiles.length > 0) {
        await invoke("reveal_in_file_manager", { filePath: exportedFiles[0] });
      }
    } catch (err) {
      console.error("Scenepack batch export failed:", err);
    }
  };

  const makeDoubleClickHandler = (key: string, onSingle: () => void, onDouble: () => void) => {
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
  const deleteDisabled = !selectedScenepackId && !selectedScenepackFolderId;
  const deleteLabel = deleteDisabled
    ? "Delete selected item"
    : selectedScenepackId
      ? "Delete selected Scenepack"
      : "Delete selected folder";

  const rootFolders = foldersByParentId.get(null) ?? [];

  const renderScenepackRow = (sp: ScenepackEntry, depth: number, inFolder: boolean) => {
    const isSel = selectedScenepackId === sp.id;
    const isOpen = openedScenepackId === sp.id;
    const paddingLeft = (inFolder ? 28 : 8) + depth * 12;

    return (
      <div
        key={sp.id}
        className={`episode-panel-row episode-row${isSel ? " is-selected" : ""}${isOpen ? " is-open" : ""}`}
        style={{ paddingLeft }}
        onClick={makeDoubleClickHandler(`sp_${sp.id}`, () => handleSelectScenepack(sp.id), () => handleOpenScenepack(sp.id))}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <FaLayerGroup className="episode-panel-import-icon" aria-hidden="true" />
        <span className="episode-panel-episode-name">{sp.name}</span>
        <span className="episode-panel-count">{sp.clips.length}</span>
      </div>
    );
  };

  const renderFolder = (folder: ScenepackFolder, depth: number): React.ReactNode => {
    const children = foldersByParentId.get(folder.id) ?? [];
    const items = scenepacksByFolderId.get(folder.id) ?? [];
    const isSel = selectedScenepackFolderId === folder.id;
    const paddingLeft = 8 + depth * 12;

    return (
      <div key={folder.id} className="episode-panel-folder">
        <div
          className={`episode-panel-row folder-row${isSel ? " is-selected" : ""}`}
          style={{ paddingLeft }}
          onClick={makeDoubleClickHandler(
            `folder_${folder.id}`,
            () => handleSelectFolder(folder.id),
            () => handleToggleFolder(folder.id)
          )}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <button
            type="button"
            className={`episode-panel-caret${folder.isExpanded ? " is-expanded" : ""}`}
            onClick={(e) => { e.stopPropagation(); handleToggleFolder(folder.id); }}
            tabIndex={-1}
          >
            ▸
          </button>
          <span className="episode-panel-folder-name">{folder.name}</span>
        </div>
        {folder.isExpanded && (children.length > 0 || items.length > 0) && (
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
            <button
              type="button"
              className="episode-panel-action icon-only"
              onClick={handleSort}
              title={sortLabel}
              aria-label={sortLabel}
            >
              <SortIcon aria-hidden="true" />
            </button>

            <button
              type="button"
              className="episode-panel-action icon-only"
              onClick={() => { setNewItemModal({ kind: "folder", parentId: null }); setNewItemName(""); }}
              title="New folder"
              aria-label="New folder"
            >
              <FaFolderPlus aria-hidden="true" />
            </button>

            <button
              type="button"
              className="episode-panel-action icon-only"
              onClick={() => { setNewItemModal({ kind: "scenepack", parentId: selectedScenepackFolderId }); setNewItemName(""); }}
              title="New Scenepack"
              aria-label="New Scenepack"
            >
              <FaLayerGroup aria-hidden="true" />
            </button>

            <button
              type="button"
              className="episode-panel-action icon-only"
              onClick={handleDeleteSelected}
              disabled={deleteDisabled}
              title={deleteLabel}
              aria-label={deleteLabel}
            >
              <FaTrashAlt aria-hidden="true" />
            </button>

            <button
              type="button"
              className="episode-panel-action icon-only"
              onClick={handleBatchExport}
              disabled={!selectedScenepackId}
              title="Batch export all clips in selected Scenepack"
              aria-label="Batch export Scenepack"
            >
              <FaFileExport aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          className="episode-panel-list"
          tabIndex={0}
          ref={panelRef}
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
        >
          {rootFolders.map((folder) => renderFolder(folder, 0))}
          {rootScenepacks.map((sp) => renderScenepackRow(sp, 0, false))}
          {rootFolders.length === 0 && rootScenepacks.length === 0 && (
            <div style={{ padding: "16px", textAlign: "center", opacity: 0.55, fontSize: "15px" }}>
              No Scenepacks yet. Create one with the + button, or add clips from the Home tab.
            </div>
          )}
        </div>

        {newItemModal && (
          <div className="episode-modal-overlay" onClick={() => setNewItemModal(null)}>
            <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
              <div className="episode-modal-title">
                {newItemModal.kind === "scenepack" ? "New Scenepack" : "New Folder"}
              </div>
              <input
                type="text"
                className="episode-modal-input"
                placeholder={newItemModal.kind === "scenepack" ? "Scenepack name..." : "Folder name..."}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateItem(); }}
                autoFocus
              />
              <div className="episode-modal-actions">
                <button className="episode-modal-btn" onClick={() => setNewItemModal(null)}>Cancel</button>
                <button className="episode-modal-btn primary" onClick={handleCreateItem} disabled={!newItemName.trim()}>Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
