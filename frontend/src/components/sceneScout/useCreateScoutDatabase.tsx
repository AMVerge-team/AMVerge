import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { FaDatabase } from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

/**
 * pick a location, create the file, then ask what to call it in the app.
 * shared by the sidebar panel and the centered first-visit layout
 */
export function useCreateScoutDatabase(onCreated?: (path: string) => void) {
  const createDatabase = useSceneScoutStore((s) => s.createDatabase);
  const renameDatabase = useSceneScoutStore((s) => s.renameDatabase);
  const openDatabase = useSceneScoutStore((s) => s.openDatabase);

  const [namingPath, setNamingPath] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");

  const startCreate = async () => {
    setError("");
    const picked = await save({
      title: "Create Scene Scout database",
      defaultPath: "My Series.scoutdb",
      filters: [{ name: "Scene Scout database", extensions: ["scoutdb"] }],
    });
    if (!picked) return;

    const result = await createDatabase(picked);
    if (!result.ok || !result.path) {
      setError(result.message || "Could not create the database.");
      return;
    }

    // default the label to the file they just named, keyed by the cli's resolved path
    // so it matches the entry in the database list
    const fileStem = result.path.split(/[/\\]/).pop()?.replace(/\.scoutdb$/i, "") ?? "Database";
    setDraftName(fileStem);
    setNamingPath(result.path);
  };

  const confirmName = () => {
    if (!namingPath) return;
    const name = draftName.trim();
    if (name) renameDatabase(namingPath, name);
    const path = namingPath;
    setNamingPath(null);
    void openDatabase(path);
    onCreated?.(path);
  };

  const modal = namingPath ? (
    <ModalShell open onClose={confirmName} label="Name this database" className="scene-scout-name-modal">
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
            if (e.key === "Enter") confirmName();
          }}
        />

        <div className="denial-notice-actions">
          <button type="button" className="event-host-btn" onClick={confirmName}>
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  ) : null;

  return { startCreate, modal, error };
}
