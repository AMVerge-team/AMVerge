import { useState, useEffect, useRef } from "react";
import { useScenepacksStore } from "../../stores/scenepackStore";
import type { ClipItem, ScenepackClip } from "../../types/domain";

type AddToScenepackModalProps = {
  clip: ClipItem;
  episodeId: string;
  onClose: () => void;
};

export function AddToScenepackModal({ clip, episodeId, onClose }: AddToScenepackModalProps) {
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const addClipToScenepack = useScenepacksStore((s) => s.addClipToScenepack);
  const addScenepack = useScenepacksStore((s) => s.addScenepack);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"select" | "create">("select");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === "create" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  const sceneIndex = clip.sceneIndex ?? 0;

  const clipData: ScenepackClip = {
    episodeId,
    sceneIndex,
    input: clip.src,
    startSec: clip.startSec,
    endSec: clip.endSec,
    clipPath: clip.clipPath,
    thumbnail: clip.thumbnail,
  };

  const handleAdd = () => {
    if (mode === "create") {
      const name = newName.trim();
      if (!name) return;
      const id = addScenepack(name, null);
      addClipToScenepack(id, clipData);
    } else if (selectedId) {
      addClipToScenepack(selectedId, clipData);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
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
          <div style={{ maxHeight: "220px", overflowY: "auto", marginBottom: "12px" }}>
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

        <div className="episode-modal-actions">
          <button className="episode-modal-btn" onClick={onClose}>Cancel</button>
          <button
            className="episode-modal-btn primary"
            onClick={handleAdd}
            disabled={mode === "select" ? !selectedId : !newName.trim()}
          >
            {mode === "create" ? "Create & Add" : "Add Clip"}
          </button>
        </div>
      </div>
    </div>
  );
}
