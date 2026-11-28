import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmModal } from "../settings/general/ConfirmModal";
import { isScoutDatabaseReady, samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";

/** asks which databases a flow ("Find matching clips") or a search with nothing selected should look in, then runs it */
export function FlowDatabasePrompt() {
  const { t } = useTranslation("scout");
  const prompt = useSceneScoutStore((s) => s.dbPrompt);
  const databases = useSceneScoutStore((s) => s.databases);
  const readyDatabases = databases.filter(isScoutDatabaseReady);
  const displayNames = useSceneScoutStore((s) => s.displayNames);
  const answer = useSceneScoutStore((s) => s.answerDbPrompt);
  const [chosen, setChosen] = useState<string[]>([]);

  // each time it opens: start from the Searching list, or the only ready database there is
  useEffect(() => {
    if (!prompt) return;
    const { selectedDatabases } = useSceneScoutStore.getState();
    const current = readyDatabases.filter((d) => selectedDatabases.some((p) => samePath(p, d.path))).map((d) => d.path);
    setChosen(current.length > 0 ? current : readyDatabases.length === 1 ? [readyDatabases[0].path] : []);
  }, [prompt, databases]);

  if (!prompt) return null;

  const isChosen = (path: string) => chosen.some((p) => samePath(p, path));
  const toggle = (path: string) =>
    setChosen((prev) => (isChosen(path) ? prev.filter((p) => !samePath(p, path)) : [...prev, path]));
  const allChosen = readyDatabases.length > 0 && readyDatabases.every((d) => isChosen(d.path));
  const isFlow = prompt.kind === "flow";

  return (
    <ConfirmModal
      title={isFlow ? t("dbPrompt.titleFlow") : t("dbPrompt.titleSearch")}
      message={
        <>
          {readyDatabases.length > 1 && (
            <button
              type="button"
              className="flow-db-prompt-all"
              onClick={() => setChosen(allChosen ? [] : readyDatabases.map((d) => d.path))}
            >
              {allChosen ? t("dbPrompt.clearAll") : t("dbPrompt.selectAll")}
            </button>
          )}
          <span className="flow-db-prompt-list" role="group" aria-label={t("dbPrompt.listLabel")}>
            {databases.map((database) => {
              const ready = isScoutDatabaseReady(database);
              const detail = !ready
                ? database.schemaStatus === "needs_upgrade"
                  ? `v${database.schemaVersion ?? 3} — upgrade in sidebar`
                  : `Unsupported v${database.schemaVersion ?? "?"}`
                : t("dbPrompt.episodeCount", { count: database.videoCount });
              return (
                <button
                  key={database.path}
                  type="button"
                  role="checkbox"
                  disabled={!ready}
                  aria-checked={ready && isChosen(database.path)}
                  className={`flow-db-prompt-option${ready && isChosen(database.path) ? " is-selected" : ""}`}
                  style={!ready ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                  onClick={() => ready && toggle(database.path)}
                >
                  <span className="flow-db-prompt-name">{displayNames[database.path] || database.name}</span>
                  <span className="flow-db-prompt-detail">{detail}</span>
                </button>
              );
            })}
          </span>
        </>
      }
      confirmLabel={isFlow ? t("dbPrompt.confirmFlow") : t("common:search")}
      confirmDisabled={chosen.length === 0}
      onConfirm={() => void answer(chosen)}
      onClose={() => void answer([])}
    />
  );
}
