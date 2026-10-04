import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FaChevronDown, FaSearch, FaSyncAlt, FaTimes } from "react-icons/fa";

import Dropdown from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import InfoButton from "../common/InfoButton";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useUIStateStore } from "../../stores/UIStore";
import {
  useGeneralSettingsStore,
  type SceneDetectionMethod,
} from "../../stores/settingsStore";
import { SCENE_DETECTION_OPTIONS } from "../settings/general/options";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { isPackInstalled } from "../../features/aiDeps/packs";
import {
  CUSTOM_THRESHOLD,
  CUSTOM_TOP_K,
  isCustomThreshold,
  isCustomTopK,
  MAX_THRESHOLD_PCT,
  MAX_TOP_K,
  MIN_THRESHOLD_PCT,
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
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const selectedVideos = useSceneScoutStore((s) => s.selectedVideos);
  const selectDatabase = useSceneScoutStore((s) => s.selectDatabase);
  const selectAllDatabases = useSceneScoutStore((s) => s.selectAllDatabases);
  const displayNames = useSceneScoutStore((s) => s.displayNames);
  const settings = useSceneScoutStore((s) => s.settings);
  const updateSettings = useSceneScoutStore((s) => s.updateSettings);
  const addVideos = useSceneScoutStore((s) => s.addVideos);
  const unloadModel = useSceneScoutStore((s) => s.unloadModel);
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

  const sceneDetectionMethod = useGeneralSettingsStore((s) => s.sceneDetectionMethod);
  const setSceneDetectionMethod = useGeneralSettingsStore((s) => s.setSceneDetectionMethod);
  const aiStatus = useAiDepsStore((s) => s.status);
  const mlInstalled = isPackInstalled(aiStatus, "ml");

  const handleSceneDetectionChange = async (method: SceneDetectionMethod) => {
    if (method === "transnetv2_gpu" && !mlInstalled) {
      const installed = await useAiDepsStore.getState().ensurePack("ml");
      if (!installed) return;
    }
    setSceneDetectionMethod(method);
  };

  const noDatabaseOpen = !opened && selectedDatabases.length === 0;
  const hasSelection = selectedDatabases.length > 0 || selectedVideos.length > 0;
  const GATE_HINT = "Please select a Database or Create one on the left panel first.";

  const labelFor = (path: string, fallback: string) => displayNames[path] ?? fallback;

  const searchPlaceholder = useMemo(() => {
    if (selectedVideos.length > 0) {
      if (selectedVideos.length === 1) {
        const vName = selectedVideos[0].split(/[/\\]/).pop() || "selected video";
        return `Describe a scene to search in "${vName}"...`;
      }
      return `Describe a scene to search across ${selectedVideos.length} selected videos...`;
    }
    if (selectedDatabases.length > 0) {
      if (selectedDatabases.length === 1) {
        const db = databases.find((d) => d.path === selectedDatabases[0] || d.path.toLowerCase() === selectedDatabases[0].toLowerCase());
        const dbName = db ? labelFor(db.path, db.name) : "selected database";
        return `Describe a scene to search in "${dbName}"...`;
      }
      return `Describe a scene to search across ${selectedDatabases.length} selected databases...`;
    }
    return "Select one or more databases or videos on the left to search...";
  }, [selectedDatabases, selectedVideos, databases, displayNames]);

  // sticky, so picking Custom keeps the box open while the field is empty and
  // topK still holds its previous preset value
  // while true the trigger is a text field rather than a dropdown, so the
  // number is typed in place instead of in a box beside it
  const [editingTopK, setEditingTopK] = useState(false);
  const [topKDraft, setTopKDraft] = useState("");

  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState("");

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

  const thresholdOptions = useMemo(() => {
    const presets = THRESHOLD_OPTIONS.filter((o) => o.value !== CUSTOM_THRESHOLD);
    const customEntry = THRESHOLD_OPTIONS.find((o) => o.value === CUSTOM_THRESHOLD)!;
    if (!isCustomThreshold(settings.threshold)) return [...presets, customEntry];
    const pct = Math.round(settings.threshold * 100);
    return [
      ...presets,
      { value: settings.threshold, label: `${pct}%`, description: "Custom" },
      customEntry,
    ];
  }, [settings.threshold]);

  const applyTopK = (topK: number) => {
    updateSettings({ topK });
    if (query.trim() && !searching) {
      void runSearch();
    }
  };

  const commitTopK = () => {
    const parsed = Number(topKDraft);
    if (Number.isFinite(parsed) && topKDraft.trim() !== "") {
      applyTopK(Math.min(MAX_TOP_K, Math.max(MIN_TOP_K, Math.round(parsed))));
    }
    setEditingTopK(false);
  };

  const applyThreshold = (threshold: number) => {
    updateSettings({ threshold });
    if (query.trim() && !searching) {
      void runSearch();
    }
  };

  const commitThreshold = () => {
    const trimmed = thresholdDraft.trim();
    if (trimmed === "" || trimmed === "-") {
      applyThreshold(-1);
    } else {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        const clamped = Math.min(MAX_THRESHOLD_PCT, Math.max(MIN_THRESHOLD_PCT, Math.round(parsed)));
        applyThreshold(clamped / 100);
      }
    }
    setEditingThreshold(false);
  };
  const [error, setError] = useState("");
  const [unloading, setUnloading] = useState(false);
  const [freed, setFreed] = useState(false);

  const handleUnloadModel = async () => {
    if (unloading) return;
    setUnloading(true);
    try {
      await unloadModel();
      setFreed(true);
      setTimeout(() => setFreed(false), 2000);
    } finally {
      setUnloading(false);
    }
  };

  const onAddEpisode = async () => {
    setError("");
    const picked = await open({
      multiple: true,
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (!picked) return;

    const paths = Array.isArray(picked) ? (picked as string[]) : [picked as string];
    if (paths.length === 0) return;

    const result = await addVideos(paths);
    if (!result.ok) setError(result.message || "Could not index episode(s).");
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
              disabled={Boolean(indexing) || searching || noDatabaseOpen}
            >
              {indexing ? "Indexing..." : "Add Episode"}
            </button>
          </Tooltip>

          <InfoButton title="Scene Scout Information">
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
              Results controls how many matches come back. Min score controls the minimum threshold for the results.
              Scenes with scores below the threshold are not shown.
              Scene detection controls which method is used to detect scenes before embeddings are created.
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

        <div className="scene-scout-search-row">
          <Tooltip content={hasSelection ? "Search selected database(s) and videos" : "Select one or more databases or videos on the left to search"}>
            <div className={`scene-scout-search-field${!hasSelection ? " is-disabled" : ""}`}>
              <FaSearch aria-hidden="true" className="scene-scout-search-icon" />
              <input
                type="text"
                value={query}
                disabled={!hasSelection || searching || Boolean(indexing)}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hasSelection && query.trim() && !searching && !indexing) {
                    void runSearch();
                  }
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
                disabled={searching || Boolean(indexing) || !query.trim() || !hasSelection}
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
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
                    applyTopK(value);
                  }}
                  className="scene-scout-dropdown"
                  showTriggerDescription={false}
                />
              )}
            </div>

            <div className="scene-scout-setting">
              <span>Min. score %</span>
              {editingThreshold ? (
                <input
                  type="number"
                  className="scene-scout-dropdown scene-scout-topk-input"
                  autoFocus
                  min={MIN_THRESHOLD_PCT}
                  max={MAX_THRESHOLD_PCT}
                  step={1}
                  placeholder={`0 to ${MAX_THRESHOLD_PCT}`}
                  value={thresholdDraft}
                  aria-label="Minimum score percentage"
                  onChange={(e) => setThresholdDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitThreshold();
                    if (e.key === "Escape") setEditingThreshold(false);
                  }}
                  onBlur={commitThreshold}
                />
              ) : (
                <Dropdown
                  options={thresholdOptions}
                  value={settings.threshold}
                  onChange={(value) => {
                    if (value === CUSTOM_THRESHOLD) {
                      setThresholdDraft(
                        settings.threshold >= 0
                          ? String(Math.round(settings.threshold * 100))
                          : ""
                      );
                      setEditingThreshold(true);
                      return;
                    }
                    applyThreshold(value);
                  }}
                  className="scene-scout-dropdown"
                  showTriggerDescription={false}
                />
              )}
            </div>

            <div className="scene-scout-setting">
              <span>Scene detection</span>
              <Dropdown
                options={SCENE_DETECTION_OPTIONS}
                value={sceneDetectionMethod}
                onChange={(method) => void handleSceneDetectionChange(method)}
                className="scene-scout-dropdown scene-scout-dropdown-detection"
                showTriggerDescription={false}
              />
            </div>

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

            <div className="checkbox-row scene-scout-preview-all">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={settings.keepModelInMemory ?? true}
                  onChange={(e) => updateSettings({ keepModelInMemory: e.target.checked })}
                />
                <span className="checkmark"></span>
              </label>
              <span>Keep model in memory</span>
            </div>

            <div className="checkbox-row scene-scout-preview-all">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={settings.gpuStandby ?? true}
                  onChange={(e) => updateSettings({ gpuStandby: e.target.checked })}
                />
                <span className="checkmark"></span>
              </label>
              <span>GPU standby (idle VRAM release)</span>
            </div>

            <button
              type="button"
              className="buttons scene-scout-unload-btn"
              onClick={() => void handleUnloadModel()}
              disabled={unloading}
              title="Unload SigLIP 2 model weights from RAM / VRAM"
            >
              {unloading ? "Freeing..." : freed ? "Memory Freed" : "Free Model Memory"}
            </button>

            {databases.length > 1 && (
            <div className="scene-scout-setting scene-scout-db-filter">
              <span>Search in</span>
              <div className="scene-scout-db-chips">
                <button
                  type="button"
                  className={`scene-scout-db-chip${selectedDatabases.length === databases.length ? " is-active" : ""}`}
                  onClick={() => selectAllDatabases()}
                >
                  All
                </button>
                {databases.map((database) => (
                  <button
                    key={database.path}
                    type="button"
                    className={`scene-scout-db-chip${selectedDatabases.some((p) => p === database.path || p.toLowerCase() === database.path.toLowerCase()) ? " is-active" : ""}`}
                    onClick={() => selectDatabase(database.path, "toggle")}
                  >
                    {labelFor(database.path, database.name)}
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        )}

        {(error || storeError) && <p className="events-error">{error || storeError}</p>}
      </div>
    </main>
  );
}

export default SceneScoutToolbar;
