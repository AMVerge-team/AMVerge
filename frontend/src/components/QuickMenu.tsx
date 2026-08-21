import { useEffect } from "react";
import { FaBars, FaCog, FaTimes } from "react-icons/fa";
import { useUIStateStore } from "../stores/UIStore";

/** Dialogs that own Escape themselves - the quick menu stays out of their way. */
const BLOCKING_OVERLAYS =
  ".episode-modal-overlay, .crop-modal-overlay, .pxm-overlay, .startup-notification-overlay";

export default function QuickMenu() {
  const open = useUIStateStore((s) => s.quickMenuOpen);
  const setQuickMenuOpen = useUIStateStore((s) => s.setQuickMenuOpen);
  const openMenu = useUIStateStore((s) => s.openMenu);
  const openSettings = useUIStateStore((s) => s.openSettings);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const { quickMenuOpen, settingsOpen, menuOpen } = useUIStateStore.getState();
      if (quickMenuOpen) {
        setQuickMenuOpen(false);
        return;
      }
      if (settingsOpen || menuOpen || document.querySelector(BLOCKING_OVERLAYS)) return;
      setQuickMenuOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setQuickMenuOpen]);

  if (!open) return null;

  return (
    <div className="quick-menu-overlay" onMouseDown={() => setQuickMenuOpen(false)}>
      <div
        className="quick-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Quick menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="quick-menu-close"
          onClick={() => setQuickMenuOpen(false)}
          aria-label="Close"
          title="Close"
        >
          <FaTimes aria-hidden="true" />
        </button>

        <div className="quick-menu-options">
          <button
            type="button"
            className="quick-menu-option"
            onClick={() => openMenu()}
          >
            <FaBars aria-hidden="true" />
            <span>Menu</span>
          </button>

          <button
            type="button"
            className="quick-menu-option"
            onClick={() => openSettings()}
          >
            <FaCog aria-hidden="true" />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
