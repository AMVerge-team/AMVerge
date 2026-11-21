import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { FaDatabase } from '../icons/animated';

import ModalShell from "../common/ModalShell";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

/** 1-step database creation inside AMVerge's managed Scene Scout folder, with an optional custom file path picker */
export function useCreateScoutDatabase(onCreated?: (path: string) => void) {
  const { t } = useTranslation("scout");
  const createDatabase = useSceneScoutStore((s) => s.createDatabase);
  const renameDatabase = useSceneScoutStore((s) => s.renameDatabase);
  const openDatabase = useSceneScoutStore((s) => s.openDatabase);

  const [naming, setNaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [customPath, setCustomPath] = useState<string | null>(null);
  const [error, setError] = useState("");
  const creatingRef = useRef(false);

  const startCreate = async () => {
    setError("");
    setDraftName("");
    setCustomPath(null);
    setCreating(false);
    creatingRef.current = false;
    setNaming(true);
  };

  const pickCustomLocation = async () => {
    const suggested = (draftName.trim() || "My Series") + ".scoutdb";
    const picked = await save({
      title: t("createDb.dialogTitle"),
      defaultPath: suggested,
      filters: [{ name: t("createDb.filter"), extensions: ["scoutdb"] }],
    });
    if (!picked) return;
    setCustomPath(picked);
    if (!draftName.trim()) {
      setDraftName(picked.split(/[/\\]/).pop()?.replace(/\.scoutdb$/i, "") ?? "Database");
    }
  };

  const confirmCreate = async () => {
    if (creatingRef.current) return;
    const name = draftName.trim();
    const target = customPath || name;
    if (!target) return;

    creatingRef.current = true;
    setCreating(true);
    setError("");
    try {
      const result = await createDatabase(target);
      if (!result.ok || !result.path) {
        setError(result.message || t("createDb.failed"));
        return;
      }
      if (name) renameDatabase(result.path, name);
      setNaming(false);
      void openDatabase(result.path);
      onCreated?.(result.path);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const modal = naming ? (
    <ModalShell
      open
      onClose={() => {
        if (!creating) setNaming(false);
      }}
      label={t("createDb.dialogTitle")}
      className="scene-scout-name-modal"
    >
      <div className="denial-notice">
        <FaDatabase aria-hidden="true" className="denial-notice-icon" />
        <h2>{t("createDb.dialogTitle")}</h2>

        <p className="events-subtitle ban-notice-note">
          A collection holds the searchable scenes for a series or clip pack. One per series works best.
        </p>

        <input
          autoFocus
          className="scene-scout-name-input"
          value={draftName}
          placeholder="e.g. Naruto Shippuden or Flow Clips"
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void confirmCreate();
          }}
        />

        {customPath && (
          <p className="events-subtitle" style={{ fontSize: 11, opacity: 0.7, wordBreak: "break-all" }}>
            Location: {customPath}
          </p>
        )}

        <div className="denial-notice-actions">
          <button
            type="button"
            className="event-host-btn"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
            onClick={() => void pickCustomLocation()}
            disabled={creating}
          >
            {customPath ? "Change location…" : "Custom location…"}
          </button>
          <button
            type="button"
            className="event-host-btn"
            onClick={() => void confirmCreate()}
            disabled={creating || (!draftName.trim() && !customPath)}
          >
            {creating ? (
              <>
                <span className="loading-spinner scene-scout-create-spinner" aria-hidden="true" />
                Creating…
              </>
            ) : (
              t("createDb.done")
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  ) : null;

  return { startCreate, modal, error };
}
