import React, { useEffect, useState, useMemo, useRef } from "react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  FaSearch,
  FaPlay,
  FaFolder,
  FaLayerGroup,
  FaBolt,
  FaPalette,
  FaCog,
  FaTerminal,
  FaBug,
  FaHistory,
  FaFolderOpen,
  FaThLarge,
  FaTimes,
  FaThumbtack,
  FaFileExport,
} from "react-icons/fa";
import { useUIStateStore } from "../stores/UIStore";
import { useEpisodePanelRuntimeStore, useEpisodePanelMetadataStore } from "../stores/episodeStore";
import { useScenepacksStore } from "../stores/scenepackStore";
import { useAppStateStore } from "../stores/appStore";
import { useThemeSettingsStore } from "../stores/settingsStore";
import { COLOR_PRESETS } from "../features/theme/colorPresets";
import { openEpisodeById } from "../hooks/useEpisodePanelState";
import useImportExport from "../hooks/useImportExport";

interface CommandItem {
  id: string;
  category: "episodes" | "scenepacks" | "actions" | "themes" | "settings";
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  action: () => void;
  preview?: {
    thumbnail?: string | null;
    metaLine1?: string;
    metaLine2?: string;
    filePath?: string;
    accentColor?: string;
    shortcut?: string;
    description?: string;
  };
}

const BLOCKING_OVERLAYS =
  ".episode-modal-overlay, .crop-modal-overlay, .pxm-overlay, .startup-notification-overlay";

export default function QuickMenu() {
  const open = useUIStateStore((s: any) => s.quickMenuOpen);
  const setQuickMenuOpen = useUIStateStore((s: any) => s.setQuickMenuOpen);
  const openMenu = useUIStateStore((s: any) => s.openMenu);
  const openSettings = useUIStateStore((s: any) => s.openSettings);
  const setActivePage = useUIStateStore((s: any) => s.setActivePage);
  const pinned = useUIStateStore((s: any) => s.pinned);
  const togglePinned = useUIStateStore((s: any) => s.togglePinned);
  const sidebarEnabled = useUIStateStore((s: any) => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore((s: any) => s.setSidebarEnabled);

  const episodes = useEpisodePanelRuntimeStore((s) => s.episodes);
  const episodeNamesById = useEpisodePanelMetadataStore((s) => s.episodeNamesById);
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const setSelectedScenepackId = useScenepacksStore((s) => s.setSelectedScenepackId);
  const setOpenedScenepackId = useScenepacksStore((s) => s.setOpenedScenepackId);

  const clips = useAppStateStore((s) => s.clips);
  const selectedClips = useAppStateStore((s) => s.selectedClips);
  const setSelectedClips = useAppStateStore((s) => s.setSelectedClips);

  const currentAccent = useThemeSettingsStore((s) => s.accentColor);
  const setAccentColor = useThemeSettingsStore((s) => s.setAccentColor);
  const setBackgroundGradientColor = useThemeSettingsStore((s) => s.setBackgroundGradientColor);

  const { onImportClick } = useImportExport();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);

  // Global toggle listener: Escape or Ctrl+K / Cmd+K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      const isEsc = e.key === "Escape";

      if (isCmdK) {
        e.preventDefault();
        const { quickMenuOpen, settingsOpen, menuOpen } = useUIStateStore.getState();
        if (settingsOpen || menuOpen || document.querySelector(BLOCKING_OVERLAYS)) return;
        setQuickMenuOpen(!quickMenuOpen);
        return;
      }

      if (isEsc) {
        const { quickMenuOpen, settingsOpen, menuOpen } = useUIStateStore.getState();
        if (quickMenuOpen) {
          setQuickMenuOpen(false);
          return;
        }
        if (settingsOpen || menuOpen || document.querySelector(BLOCKING_OVERLAYS)) return;
        setQuickMenuOpen(true);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setQuickMenuOpen]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  // Parse prefixes: @episodes, #scenepacks, >actions, !themes, ?settings
  const { filterCategory, query } = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.startsWith("@")) return { filterCategory: "episodes", query: trimmed.slice(1).trim() };
    if (trimmed.startsWith("#")) return { filterCategory: "scenepacks", query: trimmed.slice(1).trim() };
    if (trimmed.startsWith(">")) return { filterCategory: "actions", query: trimmed.slice(1).trim() };
    if (trimmed.startsWith("!")) return { filterCategory: "themes", query: trimmed.slice(1).trim() };
    if (trimmed.startsWith("?")) return { filterCategory: "settings", query: trimmed.slice(1).trim() };
    return { filterCategory: "all", query: trimmed };
  }, [searchQuery]);

  // Build searchable commands index
  const allCommands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // 1. EPISODES
    episodes.forEach((ep) => {
      const name = episodeNamesById[ep.id] || ep.displayName || ep.videoPath?.split(/[/\\]/).pop() || `Episode ${ep.id}`;
      const clipCount = ep.clips?.length || 0;
      const thumbnail = ep.clips?.[0]?.thumbnail || null;

      items.push({
        id: `ep-${ep.id}`,
        category: "episodes",
        title: name,
        subtitle: `${clipCount} clips • ${ep.videoPath || "Imported"}`,
        badge: "Episode",
        icon: FaPlay,
        action: () => {
          openEpisodeById(ep.id);
          setActivePage("home");
          setQuickMenuOpen(false);
        },
        preview: {
          thumbnail,
          metaLine1: `${clipCount} Scenes`,
          metaLine2: ep.videoPath || "Ready in library",
          filePath: ep.videoPath,
          description: "Click to load all clips into workspace timeline.",
          shortcut: "↵ Open",
        },
      });
    });

    // 2. SCENEPACKS
    scenepacks.forEach((sp) => {
      const count = sp.clips?.length || 0;
      items.push({
        id: `sp-${sp.id}`,
        category: "scenepacks",
        title: sp.name,
        subtitle: `${count} clips in pack`,
        badge: "Scenepack",
        icon: FaLayerGroup,
        action: () => {
          setSelectedScenepackId(sp.id);
          setOpenedScenepackId(sp.id);
          setActivePage("scenepacks");
          setQuickMenuOpen(false);
        },
        preview: {
          thumbnail: sp.clips?.[0]?.thumbnail || null,
          metaLine1: `${count} Clips`,
          metaLine2: "Scenepack Collection",
          description: "Click to browse and export clips from this scenepack.",
          shortcut: "↵ Open",
        },
      });
    });

    // 3. ACTIONS
    items.push(
      {
        id: "act-import",
        category: "actions",
        title: "Import Video / Episode",
        subtitle: "Launch file browser to detect and cut new footage",
        badge: "Action",
        icon: FaFolderOpen,
        action: () => {
          setQuickMenuOpen(false);
          onImportClick();
        },
        preview: {
          metaLine1: "Smart Cut Demux",
          description: "Open video file dialog to start scene detection.",
          shortcut: "⌘I",
        },
      },
      {
        id: "act-select-all",
        category: "actions",
        title: "Select All Clips",
        subtitle: `Select all ${clips.length} scenes in current grid`,
        badge: "Action",
        icon: FaThLarge,
        action: () => {
          setSelectedClips(new Set(clips.map((c) => c.id)));
          setQuickMenuOpen(false);
        },
        preview: {
          metaLine1: `${clips.length} Available Clips`,
          description: "Selects every clip in the current timeline.",
          shortcut: "Ctrl+A",
        },
      },
      {
        id: "act-clear-select",
        category: "actions",
        title: "Clear Clip Selection",
        subtitle: `Deselect currently selected ${selectedClips.size} scenes`,
        badge: "Action",
        icon: FaTimes,
        action: () => {
          setSelectedClips(new Set());
          setQuickMenuOpen(false);
        },
        preview: {
          metaLine1: `${selectedClips.size} Selected`,
          description: "Clears selection state.",
        },
      },
      {
        id: "act-pin",
        category: "actions",
        title: pinned ? "Unpin Window (Disable Always-on-Top)" : "Pin Window (Always on Top)",
        subtitle: "Keep AMVerge floating above other editing applications",
        badge: "Window",
        icon: FaThumbtack,
        action: () => {
          togglePinned();
          setQuickMenuOpen(false);
        },
        preview: {
          metaLine1: pinned ? "Status: Pinned" : "Status: Normal",
          description: "Toggles floating companion mode for Premiere / AE editing.",
        },
      },
      {
        id: "act-toggle-sidebar",
        category: "actions",
        title: sidebarEnabled ? "Hide Sidebar" : "Show Sidebar",
        subtitle: "Toggle left navigation and episode tree panel",
        badge: "Layout",
        icon: FaFolder,
        action: () => {
          setSidebarEnabled(!sidebarEnabled);
          setQuickMenuOpen(false);
        },
        preview: {
          description: "Expand or collapse the episode management sidebar.",
        },
      }
    );

    // 4. THEMES (COLOR PRESETS)
    COLOR_PRESETS.forEach((preset, idx) => {
      const isCurrent = preset.accent.toLowerCase() === currentAccent.toLowerCase();
      items.push({
        id: `th-${idx}`,
        category: "themes",
        title: `Accent Preset: ${preset.accent}`,
        subtitle: `Gradient background ${preset.gradient}`,
        badge: isCurrent ? "Active Color" : "Theme Color",
        icon: FaPalette,
        action: () => {
          setAccentColor(preset.accent);
          setBackgroundGradientColor(preset.gradient);
          setQuickMenuOpen(false);
        },
        preview: {
          accentColor: preset.accent,
          metaLine1: `Accent: ${preset.accent}`,
          metaLine2: `Gradient: ${preset.gradient}`,
          description: "Instantly applies accent color and harmonious backdrop gradient.",
          shortcut: "↵ Apply",
        },
      });
    });

    // 5. SETTINGS & DIAGNOSTICS
    items.push(
      {
        id: "set-general",
        category: "settings",
        title: "Settings: General",
        subtitle: "Scene detection method, storage directories, and app defaults",
        badge: "Settings",
        icon: FaCog,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("general");
        },
      },
      {
        id: "set-export",
        category: "settings",
        title: "Settings: Export Profiles",
        subtitle: "Hardware acceleration encoders (NVENC/AMF/QSV) and codecs",
        badge: "Settings",
        icon: FaFileExport,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("export");
        },
      },
      {
        id: "set-appearance",
        category: "settings",
        title: "Settings: Appearance",
        subtitle: "Custom background images, fonts, and tile styles",
        badge: "Settings",
        icon: FaPalette,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("appearance");
        },
      },
      {
        id: "set-deps",
        category: "settings",
        title: "Settings: AI Dependencies & Models",
        subtitle: "PyTorch, CUDA, Depth-Map, and RIFE frame interpolation",
        badge: "Settings",
        icon: FaBolt,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("dependencies");
        },
      },
      {
        id: "menu-console",
        category: "settings",
        title: "Developer Console Logs",
        subtitle: "View real-time CLI IPC messages and diagnostic streams",
        badge: "System",
        icon: FaTerminal,
        action: () => {
          setQuickMenuOpen(false);
          openMenu();
        },
      },
      {
        id: "menu-patchnotes",
        category: "settings",
        title: "Version & Update Logs",
        subtitle: "Explore changelogs and release notes",
        badge: "System",
        icon: FaHistory,
        action: () => {
          setQuickMenuOpen(false);
          openMenu();
        },
      },
      {
        id: "menu-bugreport",
        category: "settings",
        title: "Report a Bug / Issue",
        subtitle: "Submit feedback with diagnostic telemetry",
        badge: "Support",
        icon: FaBug,
        action: () => {
          setQuickMenuOpen(false);
          openMenu();
        },
      }
    );

    return items;
  }, [
    episodes,
    episodeNamesById,
    scenepacks,
    currentAccent,
    clips,
    selectedClips,
    pinned,
    sidebarEnabled,
    onImportClick,
    setSelectedScenepackId,
    setOpenedScenepackId,
    openMenu,
    openSettings,
    setActivePage,
    setSelectedClips,
    setQuickMenuOpen,
    setAccentColor,
    setBackgroundGradientColor,
    setSidebarEnabled,
    togglePinned,
  ]);

  // Filter commands by active query and prefix category
  const filteredCommands = useMemo(() => {
    const lower = query.toLowerCase();
    return allCommands.filter((cmd) => {
      if (filterCategory !== "all" && cmd.category !== filterCategory) return false;
      if (!lower) return true;
      return (
        cmd.title.toLowerCase().includes(lower) ||
        (cmd.subtitle && cmd.subtitle.toLowerCase().includes(lower)) ||
        (cmd.badge && cmd.badge.toLowerCase().includes(lower))
      );
    });
  }, [allCommands, query, filterCategory]);

  // Active highlighted command
  const activeCommand = filteredCommands[selectedIndex] || filteredCommands[0] || null;

  // Keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredCommands.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeCommand) {
        activeCommand.action();
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!resultsContainerRef.current) return;
    const selectedEl = resultsContainerRef.current.querySelector(".spotlight-item.is-selected");
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="quick-menu-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setQuickMenuOpen(false);
      }}
    >
      <div
        className="spotlight-command-center"
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight Command Center"
        onKeyDown={handleKeyDown}
      >
        {/* Top Search Input Bar */}
        <div className="spotlight-search-header">
          <FaSearch className="spotlight-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="spotlight-search-input"
            placeholder="Type a command or search... (@episodes, #scenepacks, >actions, !themes)"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="spotlight-clear-btn"
              onClick={() => {
                setSearchQuery("");
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
            >
              <FaTimes />
            </button>
          )}
          <span className="spotlight-esc-pill" onClick={() => setQuickMenuOpen(false)}>
            ESC
          </span>
        </div>

        {/* Split Body: Left Results List, Right Live Detail Card */}
        <div className="spotlight-body">
          <div className="spotlight-results-pane" ref={resultsContainerRef}>
            {filteredCommands.length === 0 ? (
              <div className="spotlight-empty-state">
                <p>No matching commands or episodes found.</p>
                <span>Try searching with prefixes like @ for episodes or &gt; for actions</span>
              </div>
            ) : (
              filteredCommands.map((cmd, idx) => {
                const isSelected = idx === selectedIndex;
                const Icon = cmd.icon;
                return (
                  <div
                    key={cmd.id}
                    className={`spotlight-item${isSelected ? " is-selected" : ""}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => cmd.action()}
                  >
                    <div className="spotlight-item-icon">
                      <Icon />
                    </div>
                    <div className="spotlight-item-content">
                      <span className="spotlight-item-title">{cmd.title}</span>
                      {cmd.subtitle && <span className="spotlight-item-subtitle">{cmd.subtitle}</span>}
                    </div>
                    {cmd.badge && <span className="spotlight-item-badge">{cmd.badge}</span>}
                  </div>
                );
              })
            )}
          </div>

          {/* Right Live Preview / Inspector Card */}
          <div className="spotlight-preview-pane">
            {activeCommand ? (
              <div className="spotlight-detail-card">
                {activeCommand.preview?.thumbnail ? (
                  <div className="spotlight-preview-media">
                    <img
                      src={
                        activeCommand.preview.thumbnail.startsWith("data:")
                          ? activeCommand.preview.thumbnail
                          : convertFileSrc(activeCommand.preview.thumbnail)
                      }
                      alt={activeCommand.title}
                    />
                  </div>
                ) : (
                  <div
                    className="spotlight-preview-icon-hero"
                    style={
                      activeCommand.preview?.accentColor
                        ? { borderColor: activeCommand.preview.accentColor, background: `${activeCommand.preview.accentColor}18` }
                        : undefined
                    }
                  >
                    {React.createElement(activeCommand.icon, {
                      className: "spotlight-hero-icon",
                      style: activeCommand.preview?.accentColor ? { color: activeCommand.preview.accentColor } : undefined,
                    })}
                  </div>
                )}

                <div className="spotlight-preview-info">
                  <h4>{activeCommand.title}</h4>
                  {activeCommand.preview?.metaLine1 && (
                    <span className="spotlight-preview-meta primary">{activeCommand.preview.metaLine1}</span>
                  )}
                  {activeCommand.preview?.metaLine2 && (
                    <span className="spotlight-preview-meta secondary">{activeCommand.preview.metaLine2}</span>
                  )}
                  {activeCommand.preview?.description && (
                    <p className="spotlight-preview-desc">{activeCommand.preview.description}</p>
                  )}
                </div>

                {/* Card Quick Actions */}
                <div className="spotlight-preview-actions">
                  <button
                    type="button"
                    className="spotlight-action-primary"
                    onClick={() => activeCommand.action()}
                  >
                    Execute Command <span className="key-hint">↵</span>
                  </button>
                  {activeCommand.preview?.filePath && (
                    <button
                      type="button"
                      className="spotlight-action-secondary"
                      onClick={() => void invoke("reveal_in_file_manager", { path: activeCommand.preview?.filePath })}
                    >
                      <FaFolderOpen /> Reveal in Explorer
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="spotlight-empty-preview">
                <FaBolt />
                <span>Select an item to view preview</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Hotkey & Community Bar */}
        <div className="spotlight-footer">
          <div className="spotlight-footer-shortcuts">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
          <div className="spotlight-footer-links">
            <button
              type="button"
              className="spotlight-footer-link"
              onClick={() => void openUrl("https://discord.gg/bmXjTgsAaN")}
            >
              Discord
            </button>
            <button
              type="button"
              className="spotlight-footer-link"
              onClick={() => void openUrl("https://github.com/AMVerge-team/AMVerge")}
            >
              GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
