import { GridPreviewIcon } from "../icons/chrome/ChromeIcons";
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
        <GridPreviewIcon filled={gridPreview} />
      </button>
    </Tooltip>
  );
}
