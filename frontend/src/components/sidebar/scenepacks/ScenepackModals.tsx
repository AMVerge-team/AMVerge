import { useTranslation } from "react-i18next";
import type { ScenepackFolder } from "../../../types/domain";
import { useEscapeToClose } from "../../common/useEscapeToClose";

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
  const { t } = useTranslation("library");
  const isPack = modal.kind === "scenepack";
  useEscapeToClose(onClose);
  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">{isPack ? t("scenepacks.newItem.titleScenepack") : t("episodePanel.newFolder.title")}</div>
        <input
          type="text"
          className="episode-modal-input"
          placeholder={isPack ? t("scenepacks.newItem.placeholderScenepack") : t("episodePanel.newFolder.placeholder")}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
          }}
          autoFocus
        />
        {isPack && rootFolders.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div className="episode-context-menu-label">{t("episodePanel.newFolder.parent")}</div>
            <div style={{ maxHeight: CATEGORY_LIST_MAX_HEIGHT, overflowY: "auto" }}>
              <div
                className={`episode-panel-row folder-row${selectedFolderId === null ? " is-selected" : ""}`}
                onClick={() => onFolderChange(null)}
                style={{ padding: "6px 8px", cursor: "pointer", marginBottom: 1 }}
              >
                <span className="episode-panel-folder-name">{t("episodePanel.newFolder.root")}</span>
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
            {t("common:cancel")}
          </button>
          <button className="episode-modal-btn primary" onClick={onCreate} disabled={!name.trim()}>
            {t("episodePanel.newFolder.create")}
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
  const { t } = useTranslation("library");
  useEscapeToClose(onClose);
  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">{t("common:rename")}</div>
        <input
          type="text"
          className="episode-modal-input"
          placeholder={t("scenepacks.rename.placeholder")}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename();
          }}
          autoFocus
        />
        <div className="episode-modal-actions">
          <button className="episode-modal-btn" onClick={onClose}>
            {t("common:cancel")}
          </button>
          <button className="episode-modal-btn primary" onClick={onRename} disabled={!name.trim()}>
            {t("common:rename")}
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
  const { t } = useTranslation("library");
  useEscapeToClose(onClose);
  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">
          {target.kind === "scenepack"
            ? t("scenepacks.deleteConfirm.titleScenepack")
            : t("episodePanel.deleteConfirm.titleFolder")}
        </div>
        <div className="episode-modal-message">
          {target.kind === "scenepack"
            ? t("scenepacks.deleteConfirm.messageScenepack")
            : t("episodePanel.deleteConfirm.messageFolder")}
        </div>
        <div className="episode-modal-subject" title={target.name}>
          {target.name}
        </div>
        {target.kind === "folder" && (
          <div className="episode-modal-note">
            {t("scenepacks.deleteConfirm.noteFolder")}
          </div>
        )}
        <div className="episode-modal-actions">
          <button className="episode-modal-btn" onClick={onClose}>
            {t("common:cancel")}
          </button>
          <button className="episode-modal-btn danger" onClick={onConfirm}>
            {t("common:delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
