import Tooltip from "./Tooltip";
import { useUIStateStore } from "../../stores/UIStore";

/** plays every tile's preview at once instead of only the hovered one; same control on home and scene scout */
export default function PreviewAllToggle() {
  const gridPreview = useUIStateStore((s) => s.gridPreview);
  const setGridPreview = useUIStateStore((s) => s.setGridPreview);
  return (
    <Tooltip content={gridPreview ? "Stop previewing all clips" : "Preview all clips"}>
      <button
        type="button"
        className={`import-button panel-toggle-button preview-all-toggle${gridPreview ? " active" : ""}`}
        onClick={() => setGridPreview(!gridPreview)}
        aria-label="Preview all clips"
        aria-pressed={gridPreview}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill={gridPreview ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
        </svg>
      </button>
    </Tooltip>
  );
}
