import { useMemo, type Ref } from "react";
import { FaSearch, FaTimes } from "react-icons/fa";

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
  const query = useSceneScoutStore((s) => s.query);
  const setQuery = useSceneScoutStore((s) => s.setQuery);
  const runSearch = useSceneScoutStore((s) => s.runSearch);
  const clearResults = useSceneScoutStore((s) => s.clearResults);
  const searching = useSceneScoutStore((s) => s.searching);
  const indexing = useSceneScoutStore((s) => s.indexing);
  const databases = useSceneScoutStore((s) => s.databases);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const selectedVideos = useSceneScoutStore((s) => s.selectedVideos);
  const displayNames = useSceneScoutStore((s) => s.displayNames);

  const hasSelection = selectedDatabases.length > 0 || selectedVideos.length > 0;
  const blocked = Boolean(blockedHint) || !hasSelection;
  const submit = onSubmit ?? (() => void runSearch());

  const placeholder = useMemo(() => {
    if (blockedHint) return blockedHint;
    if (selectedVideos.length > 0) {
      if (selectedVideos.length === 1) {
        const vName = selectedVideos[0].split(/[/\\]/).pop() || "selected video";
        return `Describe a scene to search in "${vName}"...`;
      }
      return `Describe a scene to search across ${selectedVideos.length} selected videos...`;
    }
    if (selectedDatabases.length > 0) {
      if (selectedDatabases.length === 1) {
        const db = databases.find((d) => samePath(d.path, selectedDatabases[0]));
        const dbName = db ? displayNames[db.path] ?? db.name : "selected database";
        return `Describe a scene to search in "${dbName}"...`;
      }
      return `Describe a scene to search across ${selectedDatabases.length} selected databases...`;
    }
    return "Add a database to the Searching list on the left to search...";
  }, [blockedHint, selectedDatabases, selectedVideos, databases, displayNames]);

  const canSubmit = !blocked && !searching && !indexing && Boolean(query.trim());

  return (
    <Tooltip content={blocked ? placeholder : "Search the selected databases and episodes"}>
      <div ref={fieldRef} className={`scene-scout-search-field${blocked ? " is-disabled" : ""}`}>
        <FaSearch aria-hidden="true" className="scene-scout-search-icon" />
        <input
          type="text"
          value={query}
          disabled={blocked || searching || Boolean(indexing)}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) submit();
          }}
        />
        {query && (
          <button type="button" className="scene-scout-search-clear" onClick={clearResults} aria-label="Clear search">
            <FaTimes aria-hidden="true" />
          </button>
        )}
        <button type="button" className="scene-scout-search-go" onClick={submit} disabled={!canSubmit}>
          {searching ? "Searching..." : "Search"}
        </button>
      </div>
    </Tooltip>
  );
}

export default ScoutSearchField;
