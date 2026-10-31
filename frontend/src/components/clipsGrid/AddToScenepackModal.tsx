import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FaSpinner } from "react-icons/fa";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { useUIStateStore } from "../../stores/UIStore";
import type { ClipItem } from "../../types/domain";
import { materializeClipsForScenepack } from "../../utils/scenepackMaterialize";
import { useEscapeToClose } from "../common/useEscapeToClose";

type AddToScenepackModalProps = {
  /** one clip, or the whole selection it was opened from */
  clips: ClipItem[];
  episodeId: string;
  onClose: () => void;
};

export function AddToScenepackModal({ clips: sourceClips, episodeId, onClose }: AddToScenepackModalProps) {
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

  const count = sourceClips.length;
  const noun = count === 1 ? "clip" : `${count} clips`;
  const isInPack = (clipsInPack: { episodeId: string; sceneIndex: number }[], c: ClipItem) =>
    clipsInPack.some((p) => p.episodeId === episodeId && p.sceneIndex === (c.sceneIndex ?? 0));

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
      const pack = useScenepacksStore.getState().scenepacks.find((sp) => sp.id === targetId);
      const toAdd = sourceClips.filter((c) => !pack || !isInPack(pack.clips, c));
      const { clips, failedCount } = await materializeClipsForScenepack(toAdd, targetId, episodeId);
      if (clips.length === 0) {
        setError(failedCount > 0 ? `Failed to add ${noun} to Scenepack.` : "Nothing to add.");
        return;
      }
      for (const data of clips) addClipToScenepack(targetId, data);
      setActivePage("scenepacks");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // not while the clip is being added
  useEscapeToClose(onClose, !busy);

  // portalled to <body>: the tile's hover transform would trap a fixed overlay inside its bounds
  return createPortal(
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">{count === 1 ? "Add to Scenepack" : `Add ${count} clips to Scenepack`}</div>

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
                const hasClip = sourceClips.every((c) => isInPack(sp.clips, c));
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
            ) : mode === "create" ? "Create & Add" : count === 1 ? "Add Clip" : `Add ${count} Clips`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
