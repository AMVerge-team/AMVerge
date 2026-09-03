import { useEffect } from "react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { FaBars, FaCog, FaTimes, FaDiscord, FaGithub, FaSearch } from "react-icons/fa";
import Tooltip from "./common/Tooltip";
import { useUIStateStore } from "../stores/UIStore";

/** dialogs that own Escape themselves - the quick menu stays out of their way */
const BLOCKING_OVERLAYS =
  ".episode-modal-overlay, .crop-modal-overlay, .pxm-overlay, .startup-notification-overlay";

export default function QuickMenu() {
  const open = useUIStateStore((s) => s.quickMenuOpen);
  const setQuickMenuOpen = useUIStateStore((s) => s.setQuickMenuOpen);
  const openMenu = useUIStateStore((s) => s.openMenu);
  const openSettings = useUIStateStore((s) => s.openSettings);
  const setCommandPaletteOpen = useUIStateStore((s: any) => s.setCommandPaletteOpen);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const { quickMenuOpen, settingsOpen, menuOpen, commandPaletteOpen } =
        useUIStateStore.getState() as any;
      if (quickMenuOpen) {
        setQuickMenuOpen(false);
        return;
      }
      if (settingsOpen || menuOpen || commandPaletteOpen || document.querySelector(BLOCKING_OVERLAYS)) {
        return;
      }
      setQuickMenuOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setQuickMenuOpen]);

  if (!open) return null;

  return (
    <div
      className="quick-menu-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setQuickMenuOpen(false);
      }}
    >
      <div
        className="quick-menu-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Quick menu"
      >
        <Tooltip content="Close">
          <button
            type="button"
            className="app-modal-close"
            onClick={() => setQuickMenuOpen(false)}
            aria-label="Close"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </Tooltip>

        <div className="quick-menu-hero">
          <h2 className="about-hero-title">Quick Navigation</h2>
          <p className="about-hero-subtitle">
            Quickly jump between pages, search, or configure preferences.
          </p>
        </div>

        <div className="quick-menu-grid">
          <button
            type="button"
            className="quick-menu-card"
            onClick={() => {
              setQuickMenuOpen(false);
              setCommandPaletteOpen(true);
            }}
          >
            <div className="quick-menu-card-icon">
              <FaSearch aria-hidden="true" />
            </div>
            <div className="quick-menu-card-body">
              <span className="quick-menu-card-title">Search</span>
              <span className="quick-menu-card-desc">
                Search across episodes, scenepacks, settings, and commands
              </span>
            </div>
          </button>

          <button
            type="button"
            className="quick-menu-card"
            onClick={() => {
              setQuickMenuOpen(false);
              openMenu();
            }}
          >
            <div className="quick-menu-card-icon">
              <FaBars aria-hidden="true" />
            </div>
            <div className="quick-menu-card-body">
              <span className="quick-menu-card-title">Menu</span>
              <span className="quick-menu-card-desc">
                About, Update Logs, Console, Credits, and Bug Reports
              </span>
            </div>
          </button>

          <button
            type="button"
            className="quick-menu-card"
            onClick={() => {
              setQuickMenuOpen(false);
              openSettings();
            }}
          >
            <div className="quick-menu-card-icon">
              <FaCog aria-hidden="true" />
            </div>
            <div className="quick-menu-card-body">
              <span className="quick-menu-card-title">Settings</span>
              <span className="quick-menu-card-desc">
                General options, export profiles, appearance, and AI models
              </span>
            </div>
          </button>
        </div>

        <div className="quick-menu-footer">
          <button
            type="button"
            className="quick-menu-footer-btn discord"
            onClick={() => {
              setQuickMenuOpen(false);
              void openUrl("https://discord.gg/bmXjTgsAaN");
            }}
          >
            <FaDiscord style={{ marginRight: 6, fontSize: "0.95rem" }} />
            Discord
          </button>
          <button
            type="button"
            className="quick-menu-footer-btn github"
            onClick={() => {
              setQuickMenuOpen(false);
              void openUrl("https://github.com/AMVerge-team/AMVerge");
            }}
          >
            <FaGithub style={{ marginRight: 6, fontSize: "0.95rem" }} />
            GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
