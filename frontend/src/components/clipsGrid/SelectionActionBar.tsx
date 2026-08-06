import { useState } from "react";
import { FaLayerGroup } from "react-icons/fa";
import { useAppStateStore } from "../../stores/appStore";
import { useUIStateStore } from "../../stores/UIStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { useScenepacksStore } from "../../stores/scenepackStore";
import type { ScenepackClip } from "../../types/domain";

export function SelectionActionBar() {
  const selectedClips = useAppStateStore((s) => s.selectedClips);
  const setSelectedClips = useAppStateStore((s) => s.setSelectedClips);
  const activePage = useUIStateStore((s) => s.activePage);
  const [showModal, setShowModal] = useState(false);

  if (selectedClips.size === 0 || activePage !== "home") return null;

  return (
    <>
      <div className="selection-action-bar">
        <span className="selection-action-bar-count">
          {selectedClips.size} selected
        </span>
        <button
          className="selection-action-bar-btn"
          onClick={() => setShowModal(true)}
          title="Add selected clips to Scenepack"
        >
          <FaLayerGroup />
          <span>Add to Scenepack</span>
        </button>
        <button
          className="selection-action-bar-btn"
          onClick={() => setSelectedClips(new Set())}
          title="Deselect all"
        >
          Clear
        </button>
      </div>

      {showModal && (
        <BatchAddToScenepackModal
          clipIds={[...selectedClips]}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function BatchAddToScenepackModal({
  clipIds,
  onClose,
}: {
  clipIds: string[];
  onClose: () => void;
}) {
  const openedEpisodeId = useEpisodePanelRuntimeStore((s) => s.openedEpisodeId);
  const episodeId = openedEpisodeId ?? "";
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const addClipToScenepack = useScenepacksStore((s) => s.addClipToScenepack);
  const addScenepack = useScenepacksStore((s) => s.addScenepack);
  const allClips = useAppStateStore((s) => s.clips);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"select" | "create">("select");

  const selectedClipItems = allClips.filter((c) => clipIds.includes(c.id));

  const handleAdd = () => {
    let targetId: string | null = null;
    if (mode === "create") {
      const name = newName.trim();
      if (!name) return;
      targetId = addScenepack(name, null);
    } else if (selectedId) {
      targetId = selectedId;
    }
    if (!targetId) return;

    for (const clip of selectedClipItems) {
      const data: ScenepackClip = {
        episodeId,
        sceneIndex: clip.sceneIndex ?? 0,
        input: clip.src,
        startSec: clip.startSec,
        endSec: clip.endSec,
        clipPath: clip.clipPath,
        thumbnail: clip.thumbnail,
      };
      addClipToScenepack(targetId, data);
    }
    onClose();
  };

  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">
          Add {selectedClipItems.length} clip{selectedClipItems.length !== 1 ? "s" : ""} to Scenepack
        </div>

        <div className="episode-modal-message" style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
          <button className={`episode-modal-btn${mode === "select" ? " primary" : ""}`} onClick={() => setMode("select")}>Existing</button>
          <button className={`episode-modal-btn${mode === "create" ? " primary" : ""}`} onClick={() => setMode("create")}>Create New</button>
        </div>

        {mode === "select" ? (
          <div style={{ maxHeight: "220px", overflowY: "auto", marginBottom: "12px" }}>
            {scenepacks.length === 0 ? (
              <div className="episode-modal-message" style={{ opacity: 0.55 }}>No Scenepacks yet. Switch to "Create New".</div>
            ) : (
              scenepacks.map((sp) => (
                <div
                  key={sp.id}
                  className={`episode-panel-row${selectedId === sp.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(sp.id)}
                  style={{ padding: "6px 8px", cursor: "pointer", marginBottom: "2px" }}
                >
                  <span className="episode-panel-episode-name">{sp.name}</span>
                  <span className="episode-panel-count">{sp.clips.length}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{ marginBottom: "12px" }}>
            <input
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
          <button className="episode-modal-btn primary" onClick={handleAdd}
            disabled={mode === "select" ? !selectedId : !newName.trim()}>
            {mode === "create" ? "Create & Add All" : `Add ${selectedClipItems.length} Clip${selectedClipItems.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
