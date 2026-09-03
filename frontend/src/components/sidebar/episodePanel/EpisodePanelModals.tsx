// episode Panel modal renderer. displays text input modals and confirmation modals
import type React from "react";
import type { ConfirmModalState, TextModalState } from "../types";

type EpisodePanelModalsProps = {
  textModal: TextModalState | null;
  confirmModal: ConfirmModalState | null;
  textModalInputRef: React.RefObject<HTMLInputElement | null>;
  setTextModal: React.Dispatch<React.SetStateAction<TextModalState | null>>;
  setConfirmModal: React.Dispatch<React.SetStateAction<ConfirmModalState | null>>;

  newFolderModal: { parentFolderId: string | null } | null;
  newFolderName: string;
  setNewFolderName: React.Dispatch<React.SetStateAction<string>>;
  newFolderParentId: string | null;
  setNewFolderParentId: React.Dispatch<React.SetStateAction<string | null>>;
  episodeFolders: { id: string; name: string; parentId: string | null }[];
  closeNewFolderModal: () => void;
  handleCreateNewFolder: () => void;
};

export default function EpisodePanelModals({
  textModal,
  confirmModal,
  textModalInputRef,
  setTextModal,
  setConfirmModal,
  newFolderModal,
  newFolderName,
  setNewFolderName,
  newFolderParentId,
  setNewFolderParentId,
  episodeFolders,
  closeNewFolderModal,
  handleCreateNewFolder,
}: EpisodePanelModalsProps) {
  return (
    <>
      {textModal && (
        <div className="episode-modal-overlay" onMouseDown={() => setTextModal(null)}>
          <div className="episode-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="episode-modal-title">{textModal.title}</div>

            <input
              ref={textModalInputRef}
              className="episode-modal-input"
              placeholder={textModal.placeholder}
              defaultValue={textModal.initialValue}
              onKeyDown={(e) => {
                if (e.key === "Escape") setTextModal(null);

                if (e.key === "Enter") {
                  const value = (e.currentTarget.value ?? "").trim();
                  if (!value) return;

                  textModal.onConfirm(value);
                  setTextModal(null);
                }
              }}
            />

            <div className="episode-modal-actions">
              <button
                type="button"
                className="episode-modal-btn"
                onClick={() => setTextModal(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="episode-modal-btn primary"
                onClick={() => {
                  const value = (textModalInputRef.current?.value ?? "").trim();
                  if (!value) return;

                  textModal.onConfirm(value);
                  setTextModal(null);
                }}
              >
                {textModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {newFolderModal && (
        <div className="episode-modal-overlay" onMouseDown={closeNewFolderModal}>
          <div className="episode-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="episode-modal-title">New Folder</div>

            <input
              type="text"
              className="episode-modal-input"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeNewFolderModal();
                if (e.key === "Enter") handleCreateNewFolder();
              }}
              autoFocus
            />

            {episodeFolders.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="episode-context-menu-label">Category</div>
                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                  <div
                    className={`episode-panel-row folder-row${
                      newFolderParentId === null ? " is-selected" : ""
                    }`}
                    onClick={() => setNewFolderParentId(null)}
                    style={{ padding: "6px 8px", cursor: "pointer", marginBottom: 1 }}
                  >
                    <span className="episode-panel-folder-name">None (root)</span>
                  </div>
                  {episodeFolders.map((f) => (
                    <div
                      key={f.id}
                      className={`episode-panel-row folder-row${
                        newFolderParentId === f.id ? " is-selected" : ""
                      }`}
                      onClick={() => setNewFolderParentId(f.id)}
                      style={{ padding: "6px 8px", cursor: "pointer", marginBottom: 1 }}
                    >
                      <span className="episode-panel-folder-name">{f.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="episode-modal-actions">
              <button
                type="button"
                className="episode-modal-btn"
                onClick={closeNewFolderModal}
              >
                Cancel
              </button>

              <button
                type="button"
                className="episode-modal-btn primary"
                onClick={handleCreateNewFolder}
                disabled={!newFolderName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="episode-modal-overlay" onMouseDown={() => setConfirmModal(null)}>
          <div className="episode-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="episode-modal-title">{confirmModal.title}</div>
            <div className="episode-modal-message">{confirmModal.message}</div>
            {confirmModal.note && (
              <div className="episode-modal-note">{confirmModal.note}</div>
            )}

            <div className="episode-modal-actions">
              <button
                type="button"
                className="episode-modal-btn"
                onClick={() => setConfirmModal(null)}
              >
                No
              </button>

              <button
                type="button"
                className={`episode-modal-btn primary${
                  confirmModal.confirmTone === "danger" ? " danger" : ""
                }`}
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}