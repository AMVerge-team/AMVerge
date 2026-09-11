import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FaChevronDown, FaSearch, FaSyncAlt, FaTimes } from "react-icons/fa";

import Dropdown from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import InfoButton from "../common/InfoButton";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useUIStateStore } from "../../stores/UIStore";
import {
  CUSTOM_TOP_K,
  isCustomTopK,
  MAX_TOP_K,
  MIN_TOP_K,
  THRESHOLD_OPTIONS,
  TOP_K_OPTIONS,
} from "../../features/sceneScout/types";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "avi"];

/**
 * Toolbar for the Scene Scout page: Add Episode, the search field, and the
 * search settings dropdown beneath it.
 *
 * Takes the place of the import row, exactly as `EventsToolbar` does, so the
 * page keeps the same frame as the rest of the app.
 */
export function SceneScoutToolbar() {
  const query = useSceneScoutStore((s) => s.query);
  const setQuery = useSceneScoutStore((s) => s.setQuery);
  const runSearch = useSceneScoutStore((s) => s.runSearch);
  const clearResults = useSceneScoutStore((s) => s.clearResults);
  const searching = useSceneScoutStore((s) => s.searching);
  const indexing = useSceneScoutStore((s) => s.indexing);
  const opened = useSceneScoutStore((s) => s.openedDatabase);
  const databases = useSceneScoutStore((s) => s.databases);
  const settings = useSceneScoutStore((s) => s.settings);
  const updateSettings = useSceneScoutStore((s) => s.updateSettings);
  const addVideo = useSceneScoutStore((s) => s.addVideo);
  const refresh = useSceneScoutStore((s) => s.refresh);
  const loading = useSceneScoutStore((s) => s.loading);
  const storeError = useSceneScoutStore((s) => s.error);

  // the row is padded to clear the preview pane, so the search field ends at
  // the grid's right edge instead of running under the panel
  const previewCollapsed = useUIStateStore((s) => s.previewCollapsed);
  const previewSplitPct = useUIStateStore((s) => s.previewSplitPct);
  const gridPreview = useUIStateStore((s) => s.gridPreview);
  const setGridPreview = useUIStateStore((s) => s.setGridPreview);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // indexing writes into one database, so it needs one open. searching spans
  // every database by default, so it only needs one to exist
  const noDatabaseOpen = !opened;
  const noDatabasesAtAll = databases.length === 0;
  const GATE_HINT = "Please select a Database or Create one on the left panel first.";
  // sticky, so picking Custom keeps the box open while the field is empty and
  // topK still holds its previous preset value
  // while true the trigger is a text field rather than a dropdown, so the
  // number is typed in place instead of in a box beside it
  const [editingTopK, setEditingTopK] = useState(false);
  const [topKDraft, setTopKDraft] = useState("");

  // a typed number becomes a real entry, so the closed trigger reads "Top 137"
  // rather than the bare word Custom
  const topKOptions = useMemo(() => {
    const presets = TOP_K_OPTIONS.filter((o) => o.value !== CUSTOM_TOP_K);
    const customEntry = TOP_K_OPTIONS.find((o) => o.value === CUSTOM_TOP_K)!;
    if (!isCustomTopK(settings.topK)) return [...presets, customEntry];
    return [
      ...presets,
      { value: settings.topK, label: `Top ${settings.topK}`, description: "Custom" },
      customEntry,
    ];
  }, [settings.topK]);

  const commitTopK = () => {
    const parsed = Number(topKDraft);
    if (Number.isFinite(parsed) && topKDraft.trim() !== "") {
      updateSettings({
        topK: Math.min(MAX_TOP_K, Math.max(MIN_TOP_K, Math.round(parsed))),
      });
    }
    setEditingTopK(false);
  };
  const [error, setError] = useState("");

  const onAddEpisode = async () => {
    setError("");
    const picked = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (!picked) return;

    const result = await addVideo(picked as string);
    if (!result.ok) setError(result.message || "Could not index that episode.");
  };

  const toggleDatabase = (name: string) => {
    const selected = settings.selectedDatabases;
    updateSettings({
      selectedDatabases: selected.includes(name)
        ? selected.filter((n) => n !== name)
        : [...selected, name],
    });
  };

  return (
    <main
      className="clips-import events-toolbar-shell scene-scout-toolbar-shell"
      style={
        previewCollapsed
          ? undefined
          : { paddingRight: `calc(max(280px, ${100 - previewSplitPct}%) + 10px)` }
      }
    >
      <div className="events-toolbar-rows">
        <div className="import-buttons-container events-toolbar-row">
          <Tooltip content={noDatabaseOpen ? GATE_HINT : "Index an episode into the open database"}>
            <button
              type="button"
              className="import-button events-action-button"
              onClick={() => void onAddEpisode()}
              disabled={Boolean(indexing) || noDatabaseOpen}
            >
              {indexing ? "Indexing..." : "Add Episode"}
            </button>
          </Tooltip>

          <InfoButton title="Scene Scout">
            <p>
              Scene Scout searches your indexed episodes by description rather than
              by filename. Type what you remember of a scene and it finds the
              closest matches.
            </p>

            <h4>Getting started</h4>
            <ol>
              <li>Create a database in the sidebar. One per series works well.</li>
              <li>
                Press Add Episode and pick a video. Indexing watches every scene
                once and stores a fingerprint of each, which takes a while but
                only happens once per episode.
              </li>
              <li>Search for what you want in plain language.</li>
            </ol>

            <h4>Search settings</h4>
            <p>
              Results controls how many matches come back. Match strength drops
              anything below a score, which trims weak results out of a large
              search. Both sit under the search field.
            </p>
          </InfoButton>

          <Tooltip content="Refresh databases">
            <button
              type="button"
              className="import-button refresh-button"
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh databases"
            >
              <FaSyncAlt aria-hidden="true" />
            </button>
          </Tooltip>

          <Tooltip content={noDatabasesAtAll ? GATE_HINT : "Search your indexed episodes"}>
          <div className={`scene-scout-search-field${noDatabasesAtAll ? " is-disabled" : ""}`}>
            <FaSearch aria-hidden="true" className="scene-scout-search-icon" />
            <input
              type="text"
              value={query}
              disabled={noDatabasesAtAll}
              placeholder="Describe a scene, for example: a girl standing in the rain at night"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
            {query && (
              <button
                type="button"
                className="scene-scout-search-clear"
                onClick={clearResults}
                aria-label="Clear search"
              >
                <FaTimes aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="scene-scout-search-go"
              onClick={() => void runSearch()}
              disabled={searching || !query.trim() || noDatabasesAtAll}
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
          </Tooltip>

          <Tooltip content="Search settings">
            <button
              type="button"
              className={`import-button scene-scout-settings-toggle${settingsOpen ? " is-open" : ""}`}
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-expanded={settingsOpen}
            >
              Options
              <FaChevronDown aria-hidden="true" />
            </button>
          </Tooltip>
        </div>

        {settingsOpen && (
          <div className="scene-scout-settings-row events-toolbar-row">
            <div className="scene-scout-setting">
              <span>Results</span>
              {editingTopK ? (
                <input
                  type="number"
                  className="scene-scout-dropdown scene-scout-topk-input"
                  autoFocus
                  min={MIN_TOP_K}
                  max={MAX_TOP_K}
                  placeholder={`1 to ${MAX_TOP_K}`}
                  value={topKDraft}
                  aria-label="Number of results"
                  onChange={(e) => setTopKDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTopK();
                    if (e.key === "Escape") setEditingTopK(false);
                  }}
                  // committing on blur too, so clicking away cannot leave the
                  // control stuck as a text field
                  onBlur={commitTopK}
                />
              ) : (
                <Dropdown
                  options={topKOptions}
                  value={settings.topK}
                  onChange={(value) => {
                    if (value === CUSTOM_TOP_K) {
                      setTopKDraft(String(settings.topK));
                      setEditingTopK(true);
                      return;
                    }
                    updateSettings({ topK: value });
                  }}
                  className="scene-scout-dropdown"
                  showTriggerDescription={false}
                />
              )}
            </div>

            <div className="scene-scout-setting">
              <span>Match strength</span>
              <Dropdown
                options={THRESHOLD_OPTIONS}
                value={settings.threshold}
                onChange={(threshold) => updateSettings({ threshold })}
                className="scene-scout-dropdown"
                showTriggerDescription={false}
              />
            </div>

            {/* the Home page's own markup, so the label picks up the app font
                and the 1.5rem sizing rather than this row's UI font */}
            <div className="checkbox-row scene-scout-preview-all">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={gridPreview}
                  onChange={(e) => setGridPreview(e.target.checked)}
                />
                <span className="checkmark"></span>
              </label>
              <span>Preview All</span>
            </div>

            {databases.length > 1 && (
            <div className="scene-scout-setting scene-scout-db-filter">
              <span>Search in</span>
              <div className="scene-scout-db-chips">
                {/* nothing selected means every database, which is what the CLI
                    does with no --db flags */}
                <button
                  type="button"
                  className={`scene-scout-db-chip${settings.selectedDatabases.length === 0 ? " is-active" : ""}`}
                  onClick={() => updateSettings({ selectedDatabases: [] })}
                >
                  All
                </button>
                {databases.map((database) => (
                  <button
                    key={database.name}
                    type="button"
                    className={`scene-scout-db-chip${settings.selectedDatabases.includes(database.name) ? " is-active" : ""}`}
                    onClick={() => toggleDatabase(database.name)}
                  >
                    {database.name}
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        )}

        {indexing && (
          <div className="scene-scout-progress">
            {indexing.stage}
            {indexing.total > 0 ? ` ${indexing.done}/${indexing.total}` : ""}
          </div>
        )}

        {(error || storeError) && <p className="events-error">{error || storeError}</p>}
      </div>
    </main>
  );
}

export default SceneScoutToolbar;
