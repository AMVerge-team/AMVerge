import { PanelLeftIcon, PanelRightIcon } from "../icons/chrome/ChromeIcons";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import Tooltip from "../common/Tooltip";
import { useUIStateStore } from "../../stores/UIStore";

/** pads a toolbar row clear of the preview pane, so its controls end at the grid's right edge */
export function usePreviewPaneClearance(): CSSProperties | undefined {
  const previewCollapsed = useUIStateStore((s) => s.previewCollapsed);
  const previewSplitPct = useUIStateStore((s) => s.previewSplitPct);
  return previewCollapsed ? undefined : { paddingRight: `calc(max(280px, ${100 - previewSplitPct}%) + 10px)` };
}

/** shows or hides the left database panel; same control, icon and setting as home and events */
export function SidebarToggle() {
  const sidebarEnabled = useUIStateStore((s) => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore((s) => s.setSidebarEnabled);
  const { t } = useTranslation("scout");
  const label = sidebarEnabled ? t("panels.hideDatabasePanel") : t("panels.showDatabasePanel");
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={`import-button panel-toggle-button episode-panel-toggle${sidebarEnabled ? " active" : ""}`}
        onClick={() => setSidebarEnabled(!sidebarEnabled)}
        aria-label={label}
        aria-pressed={sidebarEnabled}
      >
        <PanelLeftIcon filled={sidebarEnabled} />
      </button>
    </Tooltip>
  );
}

/** shows or hides the right preview pane; pushed to the far right of whatever row holds it */
export function PreviewToggle() {
  const previewCollapsed = useUIStateStore((s) => s.previewCollapsed);
  const setPreviewCollapsed = useUIStateStore((s) => s.setPreviewCollapsed);
  const { t } = useTranslation("scout");
  const label = previewCollapsed ? t("panels.showPreviewPanel") : t("panels.hidePreviewPanel");
  return (
    <Tooltip content={label} placement="bottom-end">
      <button
        type="button"
        className={`import-button panel-toggle-button scene-scout-preview-toggle${previewCollapsed ? "" : " active"}`}
        onClick={() => setPreviewCollapsed(!previewCollapsed)}
        aria-label={label}
        aria-pressed={!previewCollapsed}
      >
        <PanelRightIcon filled={!previewCollapsed} />
      </button>
    </Tooltip>
  );
}
