import type { ScenepackEntry, ScenepackFolder } from "../../../types/domain";
import { revealScenepackStorage } from "../../../utils/scenepackStorage";
import type { ConfirmDelete, NewItemModal, RenameModal } from "./ScenepackModals";

export type ItemMenu = { id: string; kind: "scenepack" | "folder"; x: number; y: number };
export type PanelMenu = { x: number; y: number };

type Actions = {
  openScenepack: (id: string) => void;
  moveScenepackToFolder: (packId: string, folderId: string | null) => void;
  setNewItemModal: (modal: NewItemModal | null) => void;
  setRenameModal: (modal: RenameModal | null) => void;
  setConfirmDelete: (target: ConfirmDelete) => void;
  setNewItemName: (name: string) => void;
  setModalFolderId: (id: string | null) => void;
  setThumbnailModal: (id: string | null) => void;
  close: () => void;
};

function menuStyle(x: number, y: number) {
  return { left: x, top: y };
}

export function PanelContextMenu({
  menu,
  actions,
}: {
  menu: PanelMenu;
  actions: Pick<Actions, "setNewItemModal" | "setNewItemName" | "setModalFolderId" | "close">;
}) {
  const add = (kind: "scenepack" | "folder") => () => {
    actions.setNewItemModal({ kind, parentId: null });
    actions.setNewItemName("");
    actions.setModalFolderId(null);
    actions.close();
  };

  return (
    <div
      className="episode-context-menu"
      style={menuStyle(menu.x, menu.y)}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className="episode-context-menu-item" onClick={add("scenepack")}>
        Add Scenepack
      </button>
      <button type="button" className="episode-context-menu-item" onClick={add("folder")}>
        Add Folder
      </button>
    </div>
  );
}

export function ScenepackContextMenu({
  menu,
  scenepacks,
  folders,
  actions,
}: {
  menu: ItemMenu;
  scenepacks: ScenepackEntry[];
  folders: ScenepackFolder[];
  actions: Actions;
}) {
  const pack = scenepacks.find((sp) => sp.id === menu.id);

  return (
    <div
      className="episode-context-menu"
      style={menuStyle(menu.x, menu.y)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          actions.openScenepack(menu.id);
          actions.close();
        }}
      >
        Open
      </button>

      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          if (pack) void revealScenepackStorage(pack);
          actions.close();
        }}
      >
        Show in File Explorer
      </button>

      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          const currentName = pack?.name ?? "";
          actions.setRenameModal({ id: menu.id, kind: "scenepack", currentName });
          actions.setNewItemName(currentName);
          actions.close();
        }}
      >
        Rename
      </button>

      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          actions.setThumbnailModal(menu.id);
          actions.close();
        }}
      >
        Change Thumbnail
      </button>

      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          actions.setConfirmDelete({ kind: "scenepack", id: menu.id, name: pack?.name ?? "" });
          actions.close();
        }}
      >
        Delete
      </button>

      {folders.length > 0 && (
        <>
          <div className="episode-context-menu-separator" />
          <div className="episode-context-menu-label">Move to</div>

          {pack?.folderId && (
            <button
              type="button"
              className="episode-context-menu-item"
              onClick={() => {
                actions.moveScenepackToFolder(menu.id, null);
                actions.close();
              }}
            >
              No folder
            </button>
          )}

          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="episode-context-menu-item"
              onClick={() => {
                actions.moveScenepackToFolder(menu.id, folder.id);
                actions.close();
              }}
            >
              {folder.name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

export function FolderContextMenu({
  menu,
  folders,
  actions,
}: {
  menu: ItemMenu;
  folders: ScenepackFolder[];
  actions: Actions;
}) {
  const addInside = (kind: "scenepack" | "folder") => () => {
    actions.setNewItemModal({ kind, parentId: menu.id });
    actions.setNewItemName("");
    actions.setModalFolderId(menu.id);
    actions.close();
  };

  return (
    <div
      className="episode-context-menu"
      style={menuStyle(menu.x, menu.y)}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className="episode-context-menu-item" onClick={addInside("folder")}>
        Add Subfolder
      </button>
      <button type="button" className="episode-context-menu-item" onClick={addInside("scenepack")}>
        Add Scenepack
      </button>

      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          const currentName = folders.find((f) => f.id === menu.id)?.name ?? "";
          actions.setRenameModal({ id: menu.id, kind: "folder", currentName });
          actions.setNewItemName(currentName);
          actions.close();
        }}
      >
        Rename
      </button>

      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          const name = folders.find((f) => f.id === menu.id)?.name ?? "";
          actions.setConfirmDelete({ kind: "folder", id: menu.id, name });
          actions.close();
        }}
      >
        Delete
      </button>
    </div>
  );
}
