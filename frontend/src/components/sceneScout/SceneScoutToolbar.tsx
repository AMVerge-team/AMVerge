import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { FaChevronDown, FaSyncAlt } from "react-icons/fa";

import Dropdown from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useUIStateStore } from "../../stores/UIStore";
import { playHeroFlip } from "../../features/sceneScout/heroTransition";
import { ScoutSearchField } from "./ScoutSearchField";
import { ScoutInfoButton } from "./ScoutInfoButton";
import { useAddEpisodes } from "./useAddEpisodes";
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

const OPTIONS_POP_WIDTH = 300;

/** one checkbox row in the options overlay; the whole row toggles */
function OptionToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Tooltip content={hint}>
      <label className="scene-scout-option-toggle">
        <span className="custom-checkbox">
          <input
            type="checkbox"
            className="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="checkmark"></span>
        </span>
        <span>{label}</span>
      </label>
    </Tooltip>
  );
}

/**
 * Toolbar for the Scene Scout page: Add Episode, the search field, and the
 * search settings dropdown beneath it.
 *
 * Takes the place of the import row, exactly as `EventsToolbar` does, so the
 * page keeps the same frame as the rest of the app.
 */
export function SceneScoutToolbar() {
  const query = useSceneScoutStore((s) => s.query);
  const runSearch = useSceneScoutStore((s) => s.runSearch);
  const searching = useSceneScoutStore((s) => s.searching);
  const indexing = useSceneScoutStore((s) => s.indexing);
  const opened = useSceneScoutStore((s) => s.openedDatabase);
  const databases = useSceneScoutStore((s) => s.databases);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const addToSearch = useSceneScoutStore((s) => s.addToSearch);
  const removeFromSearch = useSceneScoutStore((s) => s.removeFromSearch);
  const selectAllDatabases = useSceneScoutStore((s) => s.selectAllDatabases);
  const displayNames = useSceneScoutStore((s) => s.displayNames);
  const settings = useSceneScoutStore((s) => s.settings);
  const updateSettings = useSceneScoutStore((s) => s.updateSettings);
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
  const optionsBtnRef = useRef<HTMLDivElement>(null);
  const optionsPopRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);

  // pinned under the Options button but rendered on body, so it overlaps the grid instead of pushing it down
  useLayoutEffect(() => {
    if (!settingsOpen) {
      setPopPos(null);
      return;
    }
    const place = () => {
      const rect = optionsBtnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - OPTIONS_POP_WIDTH - 8));
      setPopPos({ top: rect.bottom + 6, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (optionsPopRef.current?.contains(target) || optionsBtnRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSettingsOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  const noDatabaseOpen = !opened && selectedDatabases.length === 0;
  const GATE_HINT = "Please select a Database or Create one on the left panel first.";

  const labelFor = (path: string, fallback: string) => displayNames[path] ?? fallback;

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

  const { startAddEpisodes, modal: addModal, error: addError } = useAddEpisodes();
  const error = addError;

  // arriving from the centered first-visit layout: slide the bar up from where it was
  // and fade the controls that were hidden there
  const searchFieldRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  useLayoutEffect(() => {
    if (playHeroFlip(searchFieldRef.current)) setRevealed(true);
  }, []);

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
              onClick={() => void startAddEpisodes()}
              disabled={Boolean(indexing) || searching || noDatabaseOpen}
            >
              {indexing ? "Indexing..." : "Add Episode"}
            </button>
          </Tooltip>

          <ScoutInfoButton />

          <Tooltip content="Refresh databases">
            <button
              type="button"
              className={`import-button refresh-button${revealed ? " scene-scout-reveal" : ""}`}
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh databases"
            >
              <FaSyncAlt aria-hidden="true" />
            </button>
          </Tooltip>

          <div ref={optionsBtnRef} className={`scene-scout-options-anchor${revealed ? " scene-scout-reveal" : ""}`}>
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
        </div>

        <div className="scene-scout-search-row">
          <ScoutSearchField fieldRef={searchFieldRef} />
        </div>

        {settingsOpen && popPos && createPortal(
          <div
            ref={optionsPopRef}
            className="scene-scout-options-pop"
            style={{ top: popPos.top, left: popPos.left, width: OPTIONS_POP_WIDTH }}
            role="dialog"
            aria-label="Search options"
          >
            <div className="scene-scout-options-grid">
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
              <span>Min score</span>
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

            </div>

            <div className="scene-scout-options-toggles">
              <OptionToggle
                label="Preview all"
                hint="Play every result's preview at once, not only the one you hover"
                checked={gridPreview}
                onChange={setGridPreview}
              />
            </div>

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
                {databases.map((database) => {
                  const inSearch = selectedDatabases.some((p) => p === database.path || p.toLowerCase() === database.path.toLowerCase());
                  return (
                    <button
                      key={database.path}
                      type="button"
                      className={`scene-scout-db-chip${inSearch ? " is-active" : ""}`}
                      onClick={() => (inSearch ? removeFromSearch([database.path]) : addToSearch([database.path]))}
                    >
                      {labelFor(database.path, database.name)}
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            <div className="scene-scout-options-footer">
              <Tooltip content="Free the RAM / VRAM the search model is using right now">
                <button
                  type="button"
                  className="buttons scene-scout-unload-btn"
                  onClick={() => void handleUnloadModel()}
                  disabled={unloading}
                >
                  {unloading ? "Unloading..." : freed ? "Unloaded" : "Unload model"}
                </button>
              </Tooltip>
            </div>
          </div>,
          document.body
        )}

        {(error || storeError) && <p className="events-error">{error || storeError}</p>}
        {addModal}
      </div>
    </main>
  );
}

export default SceneScoutToolbar;
