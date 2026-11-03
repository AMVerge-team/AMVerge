import { FaTimes } from "../icons/animated";
import Tooltip from "../common/Tooltip";
import { useAppStateStore } from "../../stores/appStore";

/** "x N selected" in a grid's toolbar, only there while something is selected */
export function SelectionCount() {
  const count = useAppStateStore((s) => s.selectedClips.size);
  const setSelectedClips = useAppStateStore((s) => s.setSelectedClips);
  if (count === 0) return null;

  return (
    <div className="selection-count">
      <Tooltip content="Clear selection">
        <button
          type="button"
          className="selection-count-clear"
          onClick={() => setSelectedClips(new Set())}
          aria-label="Clear selection"
        >
          <FaTimes aria-hidden="true" />
        </button>
      </Tooltip>
      <span>{count} selected</span>
    </div>
  );
}
