import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trans, useTranslation } from "react-i18next";
import { ConfirmModal } from "../settings/general/ConfirmModal";
import { useAppStateStore } from "../../stores/appStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

type Missing = { database: string; videoPath: string; name: string };

/** clicking a hit whose source episode isn't on this computer offers to drop it from the database */
export function MissingEpisodePrompt() {
  const { t } = useTranslation("scout");
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
      title={t("missing.title")}
      message={
        <Trans
          t={t}
          i18nKey="missing.message"
          values={{ name: missing.name, path: missing.videoPath }}
          components={{ b: <b />, code: <code /> }}
        />
      }
      confirmLabel={busy ? t("missing.removing") : t("missing.remove")}
      cancelLabel={t("missing.keep")}
      busy={busy}
      onConfirm={() => void remove()}
      onClose={() => setMissing(null)}
    />
  );
}
