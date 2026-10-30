import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaSyncAlt } from "react-icons/fa";

import Dropdown from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import { useEscapeToClose } from "../common/useEscapeToClose";
import PreviewAllToggle from "../common/PreviewAllToggle";
import { SettingsIcon } from "../icons/ToolbarIcons";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { AddEpisodeButton } from "./AddEpisodeButton";
import { heroFlipPending } from "../../features/sceneScout/heroTransition";
import { ScoutInfoButton } from "./ScoutInfoButton";
import { ScoutModeTabs } from "./ScoutModeTabs";
import { useAddEpisodes } from "./useAddEpisodes";
import { PreviewToggle, SidebarToggle, usePreviewPaneClearance } from "./PanelToggles";
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

/** the Search tab's toolbar (Add Episode, tabs, search settings), in place of home's import row */
export function SceneScoutToolbar() {
  const query = useSceneScoutStore((s) => s.query);
  const runSearch = useSceneScoutStore((s) => s.runSearch);
  const searching = useSceneScoutStore((s) => s.searching);
  const opened = useSceneScoutStore((s) => s.openedDatabase);
  const selectedDatabases = useSceneScoutStore((s) => s.selectedDatabases);
  const settings = useSceneScoutStore((s) => s.settings);
  const updateSettings = useSceneScoutStore((s) => s.updateSettings);
  const unloadModel = useSceneScoutStore((s) => s.unloadModel);
  const refresh = useSceneScoutStore((s) => s.refresh);
  const loading = useSceneScoutStore((s) => s.loading);
  const storeError = useSceneScoutStore((s) => s.error);

  // padded so the row ends at the grid's edge instead of running under the preview pane
  const clearOfPreview = usePreviewPaneClearance();

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
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [settingsOpen]);

  useEscapeToClose(() => setSettingsOpen(false), settingsOpen);

  const noDatabaseOpen = !opened && selectedDatabases.length === 0;
  const GATE_HINT = "Please select a Database or Create one on the left panel first.";

  // while set, the result count trigger is a text field; sticky so an empty Custom box stays open
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

  // coming from the first-visit layout, fade in its hidden controls (read before the search view uses the slide)
  const [revealed] = useState(heroFlipPending);

  return (
    <main className="clips-import grid-toolbar events-toolbar-shell scene-scout-toolbar-shell" style={clearOfPreview}>
      <div className="events-toolbar-rows">
        <div className="import-buttons-container events-toolbar-row">
          {/* first in the row, over the panel it controls, same as home and events */}
          <SidebarToggle />

          <AddEpisodeButton
            hint={noDatabaseOpen ? GATE_HINT : "Add episode to the open database"}
            onClick={() => void startAddEpisodes()}
            disabled={searching || noDatabaseOpen}
          />

          <ScoutModeTabs />
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
                className={`import-button icon-action-button scene-scout-settings-toggle${settingsOpen ? " is-open" : ""}`}
                onClick={() => setSettingsOpen((prev) => !prev)}
                aria-expanded={settingsOpen}
                aria-label="Search settings"
              >
                <SettingsIcon />
              </button>
            </Tooltip>
          </div>

          <PreviewAllToggle />

          {/* inline, so the row keeps home's height and the preview pane never shifts */}
          {(error || storeError) && (
            <Tooltip content={error || storeError}>
              <p className="events-error scene-scout-toolbar-error">{error || storeError}</p>
            </Tooltip>
          )}

          {/* last in the row, pushed over the preview pane it controls */}
          <PreviewToggle />
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

        {addModal}
      </div>
    </main>
  );
}

export default SceneScoutToolbar;
