import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { FaSearch, FaTimes } from '../icons/animated';

import Tooltip from "../common/Tooltip";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";

type Props = {
  fieldRef?: Ref<HTMLDivElement>;
  /** replaces the plain search, e.g. the hero also starts its slide to the top */
  onSubmit?: () => void;
  /** a reason searching is not possible yet; shown as the placeholder and blocks submit */
  blockedHint?: string | null;
};

/** the scene search field, shared by the centered first-visit layout and the top toolbar */
export function ScoutSearchField({ fieldRef, onSubmit, blockedHint = null }: Props) {
  const { t } = useTranslation("scout");
  const query = useSceneScoutStore((s) => s.query);
  const setQuery = useSceneScoutStore((s) => s.setQuery);
  const runSearch = useSceneScoutStore((s) => s.runSearch);
  const clearResults = useSceneScoutStore((s) => s.clearResults);
  const searching = useSceneScoutStore((s) => s.searching);
  const indexing = useSceneScoutStore((s) => s.indexing);
  const databases = useSceneScoutStore((s) => s.databases);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const displayNames = useSceneScoutStore((s) => s.displayNames);

  const hasSelection = selectedDatabases.length > 0;
  // nothing selected still searches: submitting asks which databases first
  const blocked = Boolean(blockedHint) || (!hasSelection && databases.length === 0);
  const submit = onSubmit ?? (() => void runSearch());

  const placeholder = useMemo(() => {
    if (blockedHint) return blockedHint;
    if (selectedDatabases.length > 0) {
      if (selectedDatabases.length === 1) {
        const db = databases.find((d) => samePath(d.path, selectedDatabases[0]));
        const dbName = db ? displayNames[db.path] ?? db.name : t("searchField.selectedDatabaseFallback");
        return t("searchField.placeholderOne", { name: dbName });
      }
      return t("searchField.placeholderMany", { count: selectedDatabases.length });
    }
    if (databases.length > 0) return t("searchField.placeholderAny");
    return t("searchField.placeholderNoDatabase");
  }, [blockedHint, selectedDatabases, databases, displayNames, t]);

  // a search while one is loading replaces it (the newest wins in the store)
  const canSubmit = !blocked && !indexing && Boolean(query.trim());

  return (
    <Tooltip content={blocked ? placeholder : t("searchField.tooltip")}>
      <div ref={fieldRef} data-scout-tour="search-field" className={`scene-scout-search-field${blocked ? " is-disabled" : ""}`}>
        <FaSearch aria-hidden="true" className="scene-scout-search-icon" />
        <input
          type="text"
          value={query}
          disabled={blocked || Boolean(indexing)}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) submit();
          }}
        />
        {query && (
          <button type="button" className="scene-scout-search-clear" onClick={clearResults} aria-label={t("searchField.clear")}>
            <FaTimes aria-hidden="true" />
          </button>
        )}
        <button type="button" className="scene-scout-search-go" onClick={submit} disabled={!canSubmit}>
          {searching ? t("searchField.searching") : t("common:search")}
        </button>
      </div>
    </Tooltip>
  );
}

export default ScoutSearchField;
