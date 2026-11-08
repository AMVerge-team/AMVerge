import { useEffect, useState } from "react";

import { ConfirmModal } from "../settings/general/ConfirmModal";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";

/** asks which databases a flow ("Find clips that flow") or a search with nothing selected should look in, then runs it */
export function FlowDatabasePrompt() {
  const prompt = useSceneScoutStore((s) => s.dbPrompt);
  const databases = useSceneScoutStore((s) => s.databases);
  const displayNames = useSceneScoutStore((s) => s.displayNames);
  const answer = useSceneScoutStore((s) => s.answerDbPrompt);
  const [chosen, setChosen] = useState<string[]>([]);

  // each time it opens: start from the Searching list, or the only database there is
  useEffect(() => {
    if (!prompt) return;
    const { selectedDatabases } = useSceneScoutStore.getState();
    const current = databases.filter((d) => selectedDatabases.some((p) => samePath(p, d.path))).map((d) => d.path);
    setChosen(current.length > 0 ? current : databases.length === 1 ? [databases[0].path] : []);
  }, [prompt, databases]);

  if (!prompt) return null;

  const isChosen = (path: string) => chosen.some((p) => samePath(p, path));
  const toggle = (path: string) =>
    setChosen((prev) => (isChosen(path) ? prev.filter((p) => !samePath(p, path)) : [...prev, path]));
  const allChosen = databases.length > 0 && databases.every((d) => isChosen(d.path));
  const isFlow = prompt.kind === "flow";

  return (
    <ConfirmModal
      title={isFlow ? "Select databases to search for matches on" : "Select databases to search through"}
      message={
        <>
          {databases.length > 1 && (
            <button
              type="button"
              className="flow-db-prompt-all"
              onClick={() => setChosen(allChosen ? [] : databases.map((d) => d.path))}
            >
              {allChosen ? "Clear all" : "Select all"}
            </button>
          )}
          <span className="flow-db-prompt-list" role="group" aria-label="Databases">
            {databases.map((database) => (
              <button
                key={database.path}
                type="button"
                role="checkbox"
                aria-checked={isChosen(database.path)}
                className={`flow-db-prompt-option${isChosen(database.path) ? " is-selected" : ""}`}
                onClick={() => toggle(database.path)}
              >
                <span className="flow-db-prompt-name">{displayNames[database.path] || database.name}</span>
                <span className="flow-db-prompt-detail">
                  {database.videoCount} episode{database.videoCount === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </span>
        </>
      }
      confirmLabel={isFlow ? "Find clips that flow" : "Search"}
      confirmDisabled={chosen.length === 0}
      onConfirm={() => void answer(chosen)}
      onClose={() => void answer([])}
    />
  );
}
