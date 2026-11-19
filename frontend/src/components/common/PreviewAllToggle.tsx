import { useTranslation } from "react-i18next";
import { GridPreviewIcon } from "../icons/chrome/ChromeIcons";
import Tooltip from "./Tooltip";
import { useUIStateStore } from "../../stores/UIStore";

export default function PreviewAllToggle() {
  const { t } = useTranslation("shell");
  const gridPreview = useUIStateStore((s) => s.gridPreview);
  const setGridPreview = useUIStateStore((s) => s.setGridPreview);
  const label = gridPreview ? t("previewAll.stop") : t("previewAll.start");
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={`import-button panel-toggle-button preview-all-toggle${gridPreview ? " active" : ""}`}
        onClick={() => setGridPreview(!gridPreview)}
        aria-label={label}
        aria-pressed={gridPreview}
      >
        <GridPreviewIcon filled={gridPreview} />
      </button>
    </Tooltip>
  );
}
