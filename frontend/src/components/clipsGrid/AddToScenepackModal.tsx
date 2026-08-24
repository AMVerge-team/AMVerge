import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FaSpinner } from "react-icons/fa";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { useUIStateStore } from "../../stores/UIStore";
import type { ClipItem } from "../../types/domain";
import { materializeClipsForScenepack } from "../../utils/scenepackMaterialize";

type AddToScenepackModalProps = {
  clip: ClipItem;
  episodeId: string;
  onClose: () => void;
};

export function AddToScenepackModal({ clip, episodeId, onClose }: AddToScenepackModalProps) {
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const addClipToScenepack = useScenepacksStore((s) => s.addClipToScenepack);
  const addScenepack = useScenepacksStore((s) => s.addScenepack);
  const setActivePage = useUIStateStore((s) => s.setActivePage);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"select" | "create">("select");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === "create" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  const sceneIndex = clip.sceneIndex ?? 0;

  const handleAdd = async () => {
    let targetId: string | null = null;
    if (mode === "create") {
      const name = newName.trim();
      if (!name) return;
      targetId = addScenepack(name, null);
    } else if (selectedId) {
      targetId = selectedId;
    }
    if (!targetId) return;

    setBusy(true);
    setError(null);
    try {
      const { clips, failedCount } = await materializeClipsForScenepack([clip], targetId, episodeId);
      if (clips.length === 0) {
        setError(failedCount > 0 ? "Failed to add clip to Scenepack." : "Nothing to add.");
        return;
      }
      addClipToScenepack(targetId, clips[0]);
      setActivePage("scenepacks");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  // portalled to <body>: this modal mounts from inside a clip tile, and
  // `.clip-wrapper:hover` applies a transform — which makes the tile the
  // containing block for any `position: fixed` descendant, so without the
  // portal the "full-screen" overlay renders squeezed into the tile's own
  // bounds instead of the viewport.
  return createPortal(
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="episode-modal-title">Add to Scenepack</div>

        <div className="episode-modal-message" style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
          <button
            className={`episode-modal-btn${mode === "select" ? " primary" : ""}`}
            onClick={() => setMode("select")}
          >
            Existing
          </button>
          <button
            className={`episode-modal-btn${mode === "create" ? " primary" : ""}`}
            onClick={() => setMode("create")}
          >
            Create New
          </button>
        </div>

        {mode === "select" ? (
          <div className="scenepack-scroll-list">
            {scenepacks.length === 0 ? (
              <div className="episode-modal-message" style={{ opacity: 0.55 }}>
                No Scenepacks yet. Switch to "Create New" to make one.
              </div>
            ) : (
              scenepacks.map((sp) => {
                const hasClip = sp.clips.some(
                  (c) => c.episodeId === episodeId && c.sceneIndex === sceneIndex
                );
                return (
                  <div
                    key={sp.id}
                    className={`episode-panel-row${selectedId === sp.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedId(sp.id)}
                    style={{ padding: "6px 8px", cursor: "pointer", marginBottom: "2px" }}
                  >
                    <span className="episode-panel-episode-name">{sp.name}</span>
                    <span className="episode-panel-count">{sp.clips.length}</span>
                    {hasClip && (
                      <span style={{ fontSize: "12px", color: "var(--accent)", fontStyle: "italic", marginLeft: "auto" }}>
                        already added
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div style={{ marginBottom: "12px" }}>
            <input
              ref={inputRef}
              type="text"
              className="episode-modal-input"
              placeholder="Scenepack name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              autoFocus
            />
          </div>
        )}

        {error && (
          <div className="episode-modal-message" style={{ color: "#ff8080", marginBottom: "8px" }}>
            {error}
          </div>
        )}

        <div className="episode-modal-actions">
          <button className="episode-modal-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="episode-modal-btn primary"
            onClick={handleAdd}
            disabled={busy || (mode === "select" ? !selectedId : !newName.trim())}
          >
            {busy ? (
              <><FaSpinner className="scenepack-spinner" aria-hidden="true" /> Adding...</>
            ) : mode === "create" ? "Create & Add" : "Add Clip"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
