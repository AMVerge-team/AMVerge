import { useEffect, useState } from "react";
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
  const [selectedIndex, setSelectedIndex] = useState(0);

  const cards = [
    {
      title: "Search",
      desc: "Search across episodes, scenepacks, settings, and commands",
      icon: FaSearch,
      run: () => setCommandPaletteOpen(true),
    },
    {
      title: "Menu",
      desc: "About, Update Logs, Console, Credits, and Bug Reports",
      icon: FaBars,
      run: () => openMenu(),
    },
    {
      title: "Settings",
      desc: "General options, export profiles, appearance, and AI models",
      icon: FaCog,
      run: () => openSettings(),
    },
  ];

  const choose = (index: number) => {
    setQuickMenuOpen(false);
    cards[index].run();
  };

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

  // each opening starts on the first card
  useEffect(() => {
    if (open) setSelectedIndex(0);
  }, [open]);

  // arrows move, Enter opens, 1-3 open a card directly
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setSelectedIndex((prev) => (Math.max(prev, 0) + step + cards.length) % cards.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0) choose(selectedIndex);
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= cards.length) {
        e.preventDefault();
        choose(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, selectedIndex]);

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

        <div className="quick-menu-grid" onMouseLeave={() => setSelectedIndex(-1)}>
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <button
                key={card.title}
                type="button"
                className={`quick-menu-card${index === selectedIndex ? " is-selected" : ""}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => choose(index)}
              >
                <div className="quick-menu-card-icon">
                  <Icon aria-hidden="true" />
                </div>
                <div className="quick-menu-card-body">
                  <span className="quick-menu-card-title">{card.title}</span>
                  <span className="quick-menu-card-desc">{card.desc}</span>
                </div>
              </button>
            );
          })}
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
