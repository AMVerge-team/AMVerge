import { useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { FaDatabase } from '../icons/animated';

import ModalShell from "../common/ModalShell";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

type Created = { ok: boolean; message: string | null; path: string | null };

/** pick a location, then name it in the app while the file is created (panel and first-visit layout) */
export function useCreateScoutDatabase(onCreated?: (path: string) => void) {
  const createDatabase = useSceneScoutStore((s) => s.createDatabase);
  const renameDatabase = useSceneScoutStore((s) => s.renameDatabase);
  const openDatabase = useSceneScoutStore((s) => s.openDatabase);

  const [naming, setNaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");
  const creationRef = useRef<Promise<Created> | null>(null);

  const startCreate = async () => {
    setError("");
    const picked = await save({
      title: "Create Scene Scout database",
      defaultPath: "My Series.scoutdb",
      filters: [{ name: "Scene Scout database", extensions: ["scoutdb"] }],
    });
    if (!picked) return;

    // the name modal opens at once; the cli creates the file meanwhile
    setDraftName(picked.split(/[/\\]/).pop()?.replace(/\.scoutdb$/i, "") ?? "Database");
    setNaming(true);
    setCreating(true);
    const creation = createDatabase(picked);
    creationRef.current = creation;
    const result = await creation;
    if (creationRef.current !== creation) return;
    setCreating(false);
    if (!result.ok || !result.path) {
      setNaming(false);
      setError(result.message || "Could not create the database.");
    }
  };

  const confirmName = async () => {
    const creation = creationRef.current;
    if (!creation || creating) return;
    const result = await creation;
    creationRef.current = null;
    setNaming(false);
    if (!result.ok || !result.path) return;
    // label keyed by the cli's resolved path, like the database list
    const name = draftName.trim();
    if (name) renameDatabase(result.path, name);
    void openDatabase(result.path);
    onCreated?.(result.path);
  };

  const modal = naming ? (
    <ModalShell open onClose={() => void confirmName()} label="Name this database" className="scene-scout-name-modal">
      <div className="denial-notice">
        <FaDatabase aria-hidden="true" className="denial-notice-icon" />
        <h2>Name this database</h2>

        <p className="events-subtitle ban-notice-note">
          This is only the label shown in the sidebar. The file keeps the name you gave it.
        </p>

        <input
          autoFocus
          className="scene-scout-name-input"
          value={draftName}
          placeholder="Database name"
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void confirmName();
          }}
        />

        <div className="denial-notice-actions">
          <button type="button" className="event-host-btn" onClick={() => void confirmName()} disabled={creating}>
            {creating ? (
              <>
                <span className="loading-spinner scene-scout-create-spinner" aria-hidden="true" />
                Creating database…
              </>
            ) : (
              "Done"
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  ) : null;

  return { startCreate, modal, error };
}
