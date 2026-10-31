import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Dropdown from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import { useEscapeToClose } from "../common/useEscapeToClose";
import { SettingsIcon } from "../icons/ToolbarIcons";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import {
  CUSTOM_TOP_K,
  isCustomTopK,
  MAX_TOP_K,
  MIN_TOP_K,
  TOP_K_OPTIONS,
} from "../../features/sceneScout/types";

const OPTIONS_POP_WIDTH = 180;

type Props = {
  /** runs the tab's search again with the new settings, when there is one to re-run */
  rerun: () => void;
  /** extra class on the anchor, e.g. the fade-in after the first-visit layout */
  className?: string;
};

/** results count and unload model; Search and Flow share the same settings */
export function ScoutSettingsButton({ rerun, className = "" }: Props) {
  const settings = useSceneScoutStore((s) => s.settings);
  const updateSettings = useSceneScoutStore((s) => s.updateSettings);
  const unloadModel = useSceneScoutStore((s) => s.unloadModel);

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

  // while set, the result count trigger is a text field; sticky so an empty Custom box stays open
  const [editingTopK, setEditingTopK] = useState(false);
  const [topKDraft, setTopKDraft] = useState("");

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

  const applyTopK = (topK: number) => {
    updateSettings({ topK });
    rerun();
  };

  const commitTopK = () => {
    const parsed = Number(topKDraft);
    if (Number.isFinite(parsed) && topKDraft.trim() !== "") {
      applyTopK(Math.min(MAX_TOP_K, Math.max(MIN_TOP_K, Math.round(parsed))));
    }
    setEditingTopK(false);
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

  return (
    <>
      <div ref={optionsBtnRef} className={`scene-scout-options-anchor ${className}`.trim()}>
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
    </>
  );
}

export default ScoutSettingsButton;
