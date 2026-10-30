import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmModal } from "../settings/general/ConfirmModal";
import { useAppStateStore } from "../../stores/appStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

type Missing = { database: string; videoPath: string; name: string };

/**
 * a scout hit plays a range of its source episode. a database brought in from elsewhere
 * can point at episodes this computer does not have, so clicking one asks to drop it
 */
export function MissingEpisodePrompt() {
  const focusedClipId = useAppStateStore((s) => s.focusedClipId);
  const [missing, setMissing] = useState<Missing | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const clip = useAppStateStore.getState().clips.find((c) => c.id === focusedClipId);
    if (!clip?.database || clip.clipPath) return;
    const database = clip.database;
    const videoPath = clip.src;
    let cancelled = false;
    invoke<boolean>("path_exists", { path: videoPath })
      .then((exists) => {
        if (!cancelled && !exists) setMissing({ database, videoPath, name: clip.originalName ?? videoPath });
      })
      .catch((err) => console.warn("SCOUT|source check failed", err));
    return () => { cancelled = true; };
  }, [focusedClipId]);

  if (!missing) return null;

  const remove = async () => {
    setBusy(true);
    try {
      await useSceneScoutStore.getState().removeMissingVideo(missing.database, missing.videoPath);
    } finally {
      setBusy(false);
      setMissing(null);
    }
  };

  return (
    <ConfirmModal
      title="Episode not found"
      message={
        <>
          <b>{missing.name}</b> is no longer at <code>{missing.videoPath}</code>, so its scenes can't play.
          Remove this episode from the database?
        </>
      }
      confirmLabel={busy ? "Removing…" : "Remove from database"}
      cancelLabel="Keep"
      busy={busy}
      onConfirm={() => void remove()}
      onClose={() => setMissing(null)}
    />
  );
}
