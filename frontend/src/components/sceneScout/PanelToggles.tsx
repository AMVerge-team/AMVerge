import Tooltip from "../common/Tooltip";
import { useUIStateStore } from "../../stores/UIStore";

/** shows or hides the left database panel; same control, icon and setting as home and events */
export function SidebarToggle() {
  const sidebarEnabled = useUIStateStore((s) => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore((s) => s.setSidebarEnabled);
  const label = sidebarEnabled ? "Hide database panel" : "Show database panel";
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={`import-button panel-toggle-button episode-panel-toggle${sidebarEnabled ? " active" : ""}`}
        onClick={() => setSidebarEnabled(!sidebarEnabled)}
        aria-label={label}
        aria-pressed={sidebarEnabled}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
          {sidebarEnabled && <rect x="3.9" y="4.9" width="4.2" height="14.2" rx="1" fill="currentColor" stroke="none" />}
        </svg>
      </button>
    </Tooltip>
  );
}

/** shows or hides the right preview pane; pushed to the far right of whatever row holds it */
export function PreviewToggle() {
  const previewCollapsed = useUIStateStore((s) => s.previewCollapsed);
  const setPreviewCollapsed = useUIStateStore((s) => s.setPreviewCollapsed);
  const label = previewCollapsed ? "Show preview panel" : "Hide preview panel";
  return (
    <Tooltip content={label} placement="bottom-end">
      <button
        type="button"
        className={`import-button panel-toggle-button scene-scout-preview-toggle${previewCollapsed ? "" : " active"}`}
        onClick={() => setPreviewCollapsed(!previewCollapsed)}
        aria-label={label}
        aria-pressed={!previewCollapsed}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M15 3v18" />
          {!previewCollapsed && <rect x="15.9" y="4.9" width="4.2" height="14.2" rx="1" fill="currentColor" stroke="none" />}
        </svg>
      </button>
    </Tooltip>
  );
}
