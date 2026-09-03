import type { ScenepackFolder } from "../../../types/domain";

export type NewItemModal = { kind: "scenepack" | "folder"; parentId: string | null };
export type RenameModal = { id: string; kind: "scenepack" | "folder"; currentName: string };
export type ConfirmDelete = { kind: "scenepack" | "folder"; id: string; name: string };

const CATEGORY_LIST_MAX_HEIGHT = 140;

type NewItemProps = {
  modal: NewItemModal;
  name: string;
  folders: ScenepackFolder[];
  rootFolders: ScenepackFolder[];
  selectedFolderId: string | null;
  onNameChange: (name: string) => void;
  onFolderChange: (id: string | null) => void;
  onCreate: () => void;
  onClose: () => void;
};

export function NewItemModal({
  modal,
  name,
  folders,
  rootFolders,
  selectedFolderId,
  onNameChange,
  onFolderChange,
  onCreate,
  onClose,
}: NewItemProps) {
  const isPack = modal.kind === "scenepack";
  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">{isPack ? "New Scenepack" : "New Folder"}</div>
        <input
          type="text"
          className="episode-modal-input"
          placeholder={isPack ? "Scenepack name..." : "Folder name..."}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
          }}
          autoFocus
        />
        {isPack && rootFolders.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div className="episode-context-menu-label">Category</div>
            <div style={{ maxHeight: CATEGORY_LIST_MAX_HEIGHT, overflowY: "auto" }}>
              <div
                className={`episode-panel-row folder-row${selectedFolderId === null ? " is-selected" : ""}`}
                onClick={() => onFolderChange(null)}
                style={{ padding: "6px 8px", cursor: "pointer", marginBottom: 1 }}
              >
                <span className="episode-panel-folder-name">None (root)</span>
              </div>
              {folders.map((f) => (
                <div
                  key={f.id}
                  className={`episode-panel-row folder-row${selectedFolderId === f.id ? " is-selected" : ""}`}
                  onClick={() => onFolderChange(f.id)}
                  style={{ padding: "6px 8px", cursor: "pointer", marginBottom: 1 }}
                >
                  <span className="episode-panel-folder-name">{f.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="episode-modal-actions">
          <button className="episode-modal-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="episode-modal-btn primary" onClick={onCreate} disabled={!name.trim()}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

type RenameProps = {
  name: string;
  onNameChange: (name: string) => void;
  onRename: () => void;
  onClose: () => void;
};

export function RenameItemModal({ name, onNameChange, onRename, onClose }: RenameProps) {
  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">Rename</div>
        <input
          type="text"
          className="episode-modal-input"
          placeholder="New name..."
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename();
          }}
          autoFocus
        />
        <div className="episode-modal-actions">
          <button className="episode-modal-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="episode-modal-btn primary" onClick={onRename} disabled={!name.trim()}>
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}

type DeleteProps = {
  target: ConfirmDelete;
  onConfirm: () => void;
  onClose: () => void;
};

export function DeleteItemModal({ target, onConfirm, onClose }: DeleteProps) {
  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">
          Delete {target.kind === "scenepack" ? "Scenepack" : "Folder"}
        </div>
        <div className="episode-modal-message">
          Are you sure you want to delete "{target.name}"?
        </div>
        {target.kind === "folder" && (
          <div className="episode-modal-note">
            All Scenepacks inside this folder will be moved to root.
          </div>
        )}
        <div className="episode-modal-actions">
          <button className="episode-modal-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="episode-modal-btn danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
