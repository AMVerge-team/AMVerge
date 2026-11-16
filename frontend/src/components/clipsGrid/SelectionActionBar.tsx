import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaLayerGroup, FaSpinner } from '../icons/animated';
import Tooltip from "../common/Tooltip";
import { useEscapeToClose } from "../common/useEscapeToClose";
import { useAppStateStore } from "../../stores/appStore";
import { useUIStateStore } from "../../stores/UIStore";
import { useFeature } from "../../features/featureToggles";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { materializeClipsForScenepack } from "../../utils/scenepackMaterialize";

export function SelectionActionBar() {
  const { t } = useTranslation("library");
  const selectedClips = useAppStateStore((s) => s.selectedClips);
  const setSelectedClips = useAppStateStore((s) => s.setSelectedClips);
  const activePage = useUIStateStore((s) => s.activePage);
  const scenepacks = useFeature("scenepacks");
  const [showModal, setShowModal] = useState(false);

  // home only: pack clips are already materialized copies; hidden when the feature is off
  const showAddToScenepack = activePage === "home" && scenepacks.enabled;

  if (selectedClips.size === 0 || !showAddToScenepack) return null;

  return (
    <>
      <div className="selection-action-bar">
        <span className="selection-action-bar-count">
          {t("selection.count", { count: selectedClips.size })}
        </span>
        {showAddToScenepack && (
          <Tooltip content={t("selection.addSelectedTooltip")}>
            <button
              className="selection-action-bar-btn"
              onClick={() => setShowModal(true)}
            >
              <FaLayerGroup />
              <span>{t("addToScenepack.title")}</span>
            </button>
          </Tooltip>
        )}
        <Tooltip content={t("selection.deselectAll")}>
          <button
            className="selection-action-bar-btn"
            onClick={() => setSelectedClips(new Set())}
          >
            {t("selection.clear")}
          </button>
        </Tooltip>
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
  const { t } = useTranslation("library");
  const openedEpisodeId = useEpisodePanelRuntimeStore((s) => s.openedEpisodeId);
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const addClipToScenepack = useScenepacksStore((s) => s.addClipToScenepack);
  const addScenepack = useScenepacksStore((s) => s.addScenepack);
  const allClips = useAppStateStore((s) => s.clips);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"select" | "create">("select");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // not while clips are being added
  useEscapeToClose(onClose, !busy);

  const selectedClipItems = allClips.filter((c) => clipIds.includes(c.id));

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
    setProgress({ percent: 0, message: t("selection.addingProgress", { count: selectedClipItems.length }) });
    try {
      const { clips, failedCount } = await materializeClipsForScenepack(
        selectedClipItems,
        targetId,
        openedEpisodeId,
        (percent, message) => setProgress({ percent, message })
      );
      for (const data of clips) addClipToScenepack(targetId, data);
      if (clips.length === 0) {
        setError(t("selection.addFailed"));
        return;
      }
      if (failedCount > 0) {
        console.error(`${failedCount} clip(s) failed to add to Scenepack.`);
      }
      useScenepacksStore.getState().setOpenedScenepackId(targetId);
      const { setActivePage } = useUIStateStore.getState();
      setActivePage("scenepacks");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">
          {t("addToScenepack.titleCount", { count: selectedClipItems.length })}
        </div>

        <div className="episode-modal-message" style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
          <button className={`episode-modal-btn${mode === "select" ? " primary" : ""}`} onClick={() => setMode("select")}>{t("addToScenepack.existing")}</button>
          <button className={`episode-modal-btn${mode === "create" ? " primary" : ""}`} onClick={() => setMode("create")}>{t("addToScenepack.createNew")}</button>
        </div>

        {mode === "select" ? (
          <div className="scenepack-scroll-list">
            {scenepacks.length === 0 ? (
              <div className="episode-modal-message" style={{ opacity: 0.55 }}>{t("addToScenepack.noScenepacks")}</div>
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
              placeholder={t("scenepacks.newItem.placeholderScenepack")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              autoFocus
            />
          </div>
        )}

        {progress && (
          <div className="episode-modal-message" style={{ marginBottom: "8px" }}>
            <FaSpinner className="scenepack-spinner" aria-hidden="true" style={{ marginRight: 6 }} />
            {progress.message} ({progress.percent}%)
          </div>
        )}
        {error && (
          <div className="episode-modal-message" style={{ color: "#ff8080", marginBottom: "8px" }}>
            {error}
          </div>
        )}

        <div className="episode-modal-actions">
          <button className="episode-modal-btn" onClick={onClose} disabled={busy}>{t("common:cancel")}</button>
          <button className="episode-modal-btn primary" onClick={handleAdd}
            disabled={busy || (mode === "select" ? !selectedId : !newName.trim())}>
            {busy
              ? t("addToScenepack.adding")
              : mode === "create" ? t("selection.createAndAddAll") : t("addToScenepack.addClips", { count: selectedClipItems.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
