import { useTranslation } from "react-i18next";
import { FaTimes } from "../icons/animated";
import Tooltip from "../common/Tooltip";
import { useAppStateStore } from "../../stores/appStore";

/** "x N selected" in a grid's toolbar, only there while something is selected */
export function SelectionCount() {
  const { t } = useTranslation("library");
  const count = useAppStateStore((s) => s.selectedClips.size);
  const setSelectedClips = useAppStateStore((s) => s.setSelectedClips);
  if (count === 0) return null;

  return (
    <div className="selection-count">
      <Tooltip content={t("selection.clearSelection")}>
        <button
          type="button"
          className="selection-count-clear"
          onClick={() => setSelectedClips(new Set())}
          aria-label={t("selection.clearSelection")}
        >
          <FaTimes aria-hidden="true" />
        </button>
      </Tooltip>
      <span>{t("selection.count", { count })}</span>
    </div>
  );
}
