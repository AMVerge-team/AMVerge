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
  FaAngleRight,
} from "react-icons/fa";
import { useUIStateStore } from "../stores/UIStore";
import { useEpisodePanelRuntimeStore, useEpisodePanelMetadataStore } from "../stores/episodeStore";
import { useScenepacksStore } from "../stores/scenepackStore";
import { useAppStateStore } from "../stores/appStore";
import { useThemeSettingsStore } from "../stores/settingsStore";
import { COLOR_PRESETS } from "../features/theme/colorPresets";
import { openEpisodeById } from "../hooks/useEpisodePanelState";
import useImportExport from "../hooks/useImportExport";

type CategoryFilter = "all" | "episodes" | "scenepacks" | "actions" | "themes" | "settings";

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
    metaTags?: string[];
    metaLine1?: string;
    metaLine2?: string;
    filePath?: string;
    accentColor?: string;
    shortcut?: string;
    description?: string;
  };
}

const CATEGORY_CHIPS: { id: CategoryFilter; label: string; icon: any; prefix: string }[] = [
  { id: "all", label: "All Items", icon: FaSearch, prefix: "" },
  { id: "episodes", label: "Episodes", icon: FaPlay, prefix: "@" },
  { id: "scenepacks", label: "Scenepacks", icon: FaLayerGroup, prefix: "#" },
  { id: "actions", label: "Actions", icon: FaBolt, prefix: ">" },
  { id: "themes", label: "Themes", icon: FaPalette, prefix: "!" },
  { id: "settings", label: "Settings", icon: FaCog, prefix: "?" },
];

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
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
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
      setActiveFilter("all");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  // Parse prefixes or chip filter
  const { effectiveFilter, cleanQuery } = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.startsWith("@")) return { effectiveFilter: "episodes" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    if (trimmed.startsWith("#")) return { effectiveFilter: "scenepacks" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    if (trimmed.startsWith(">")) return { effectiveFilter: "actions" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    if (trimmed.startsWith("!")) return { effectiveFilter: "themes" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    if (trimmed.startsWith("?")) return { effectiveFilter: "settings" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    return { effectiveFilter: activeFilter, cleanQuery: trimmed };
  }, [searchQuery, activeFilter]);

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
        subtitle: `${clipCount} scenes • ${ep.videoPath || "Ready in library"}`,
        badge: "Episode",
        icon: FaPlay,
        action: () => {
          openEpisodeById(ep.id);
          setActivePage("home");
          setQuickMenuOpen(false);
        },
        preview: {
          thumbnail,
          metaTags: [`${clipCount} Clips`, "Keyframe / TransNet", "Video Source"],
          metaLine1: name,
          metaLine2: ep.videoPath || "Imported Video File",
          filePath: ep.videoPath,
          description: "Immediately loads and streams all cut clips into the timeline workspace.",
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
        subtitle: `${count} scenes collected`,
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
          metaTags: [`${count} Clips`, "Scenepack", "Saved Collection"],
          metaLine1: sp.name,
          metaLine2: "Custom Scene Pack",
          description: "Browse, filter, and batch export clips grouped in this scenepack.",
          shortcut: "↵ Open",
        },
      });
    });

    // 3. ACTIONS
    items.push(
      {
        id: "act-import",
        category: "actions",
        title: "Import New Episode",
        subtitle: "Launch file browser to detect and cut new footage",
        badge: "Action",
        icon: FaFolderOpen,
        action: () => {
          setQuickMenuOpen(false);
          onImportClick();
        },
        preview: {
          metaTags: ["Pipeline", "Demux", "SmartCut"],
          metaLine1: "Scene Detection Pipeline",
          description: "Select an MKV / MP4 file to run TransNetV2 AI or fast keyframe demux.",
          shortcut: "⌘I",
        },
      },
      {
        id: "act-select-all",
        category: "actions",
        title: "Select All Clips",
        subtitle: `Select all ${clips.length} scenes in timeline`,
        badge: "Selection",
        icon: FaThLarge,
        action: () => {
          setSelectedClips(new Set(clips.map((c) => c.id)));
          setQuickMenuOpen(false);
        },
        preview: {
          metaTags: [`${clips.length} Clips`, "Timeline"],
          metaLine1: "Bulk Selection",
          description: "Highlights and selects every scene for batch export or merge.",
          shortcut: "Ctrl+A",
        },
      },
      {
        id: "act-clear-select",
        category: "actions",
        title: "Clear Selection",
        subtitle: `Deselect currently selected ${selectedClips.size} scenes`,
        badge: "Selection",
        icon: FaTimes,
        action: () => {
          setSelectedClips(new Set());
          setQuickMenuOpen(false);
        },
        preview: {
          metaTags: [`${selectedClips.size} Selected`],
          metaLine1: "Deselect All",
          description: "Clears current timeline selection.",
        },
      },
      {
        id: "act-pin",
        category: "actions",
        title: pinned ? "Unpin Window (Normal Mode)" : "Pin Window (Always on Top)",
        subtitle: "Toggle floating companion window for After Effects / Premiere",
        badge: "Window",
        icon: FaThumbtack,
        action: () => {
          togglePinned();
          setQuickMenuOpen(false);
        },
        preview: {
          metaTags: [pinned ? "Currently Pinned" : "Normal Window", "Companion Size"],
          metaLine1: "Always on Top Mode",
          description: "Shrinks and pins AMVerge over your video editor workspace.",
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
          metaTags: [sidebarEnabled ? "Sidebar Visible" : "Sidebar Hidden", "Navigation"],
          metaLine1: "Sidebar Visibility",
          description: "Expands or collapses the left episode panel to save screen space.",
        },
      }
    );

    // 4. THEMES (COLOR PRESETS)
    COLOR_PRESETS.forEach((preset, idx) => {
      const isCurrent = preset.accent.toLowerCase() === currentAccent.toLowerCase();
      items.push({
        id: `th-${idx}`,
        category: "themes",
        title: `Color Accent: ${preset.accent}`,
        subtitle: `Harmonious gradient ${preset.gradient}`,
        badge: isCurrent ? "Active" : "Theme",
        icon: FaPalette,
        action: () => {
          setAccentColor(preset.accent);
          setBackgroundGradientColor(preset.gradient);
          setQuickMenuOpen(false);
        },
        preview: {
          accentColor: preset.accent,
          metaTags: ["Live Palette", preset.accent],
          metaLine1: `Theme Accent: ${preset.accent}`,
          metaLine2: `Gradient: ${preset.gradient}`,
          description: "Applies accent tint, glowing UI highlights, and matching dark gradient backdrop.",
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

  // Filter commands
  const filteredCommands = useMemo(() => {
    const lower = cleanQuery.toLowerCase();
    return allCommands.filter((cmd) => {
      if (effectiveFilter !== "all" && cmd.category !== effectiveFilter) return false;
      if (!lower) return true;
      return (
        cmd.title.toLowerCase().includes(lower) ||
        (cmd.subtitle && cmd.subtitle.toLowerCase().includes(lower)) ||
        (cmd.badge && cmd.badge.toLowerCase().includes(lower))
      );
    });
  }, [allCommands, cleanQuery, effectiveFilter]);

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
    } else if (e.key === "Tab") {
      e.preventDefault();
      // Cycle category filter
      const idx = CATEGORY_CHIPS.findIndex((c) => c.id === activeFilter);
      const next = CATEGORY_CHIPS[(idx + 1) % CATEGORY_CHIPS.length].id;
      setActiveFilter(next);
      setSelectedIndex(0);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!resultsContainerRef.current) return;
    const selectedEl = resultsContainerRef.current.querySelector(".spotlight-pro-item.is-selected");
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  return (
    <div
      className="quick-menu-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setQuickMenuOpen(false);
      }}
    >
      <div
        className="spotlight-pro-container"
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight Command Center"
        onKeyDown={handleKeyDown}
      >
        {/* TOP SEARCH BAR */}
        <div className="spotlight-pro-header">
          <div className="spotlight-pro-searchbox">
            <FaSearch className="spotlight-pro-search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="spotlight-pro-input"
              placeholder="Search episodes, scenepacks, actions, settings..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="spotlight-pro-clear-btn"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                <FaTimes />
              </button>
            )}
          </div>
          <button
            type="button"
            className="spotlight-pro-close-pill"
            onClick={() => setQuickMenuOpen(false)}
          >
            ESC
          </button>
        </div>

        {/* FILTER CHIPS ROW */}
        <div className="spotlight-pro-chips-bar">
          {CATEGORY_CHIPS.map((chip) => {
            const ChipIcon = chip.icon;
            const isChipActive = effectiveFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                className={`spotlight-chip${isChipActive ? " active" : ""}`}
                onClick={() => {
                  setActiveFilter(chip.id);
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                <ChipIcon className="chip-icon" />
                <span>{chip.label}</span>
                {chip.prefix && <span className="chip-prefix">{chip.prefix}</span>}
              </button>
            );
          })}
        </div>

        {/* 60 / 40 SPLIT BODY */}
        <div className="spotlight-pro-body">
          {/* LEFT: RESULTS LIST */}
          <div className="spotlight-pro-list-pane" ref={resultsContainerRef}>
            {filteredCommands.length === 0 ? (
              <div className="spotlight-pro-empty">
                <FaSearch className="empty-icon" />
                <h4>No matching results found</h4>
                <p>Try searching another title or use category filter chips above</p>
              </div>
            ) : (
              filteredCommands.map((cmd, idx) => {
                const isSelected = idx === selectedIndex;
                const Icon = cmd.icon;
                return (
                  <div
                    key={cmd.id}
                    className={`spotlight-pro-item${isSelected ? " is-selected" : ""}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => cmd.action()}
                  >
                    <div className="spotlight-pro-item-icon">
                      <Icon />
                    </div>
                    <div className="spotlight-pro-item-main">
                      <div className="item-title-row">
                        <span className="item-title">{cmd.title}</span>
                        {cmd.badge && <span className="item-badge">{cmd.badge}</span>}
                      </div>
                      {cmd.subtitle && <span className="item-sub">{cmd.subtitle}</span>}
                    </div>
                    <FaAngleRight className="item-arrow" />
                  </div>
                );
              })
            )}
          </div>

          {/* RIGHT: RICH INSPECTOR CARD */}
          <div className="spotlight-pro-inspector-pane">
            {activeCommand ? (
              <div className="spotlight-inspector-content">
                {/* Hero Media Banner */}
                {activeCommand.preview?.thumbnail ? (
                  <div className="inspector-media-banner">
                    <img
                      src={
                        activeCommand.preview.thumbnail.startsWith("data:")
                          ? activeCommand.preview.thumbnail
                          : convertFileSrc(activeCommand.preview.thumbnail)
                      }
                      alt={activeCommand.title}
                    />
                    <div className="media-overlay-gradient" />
                  </div>
                ) : (
                  <div
                    className="inspector-icon-hero"
                    style={
                      activeCommand.preview?.accentColor
                        ? {
                            borderColor: `${activeCommand.preview.accentColor}40`,
                            background: `linear-gradient(180deg, ${activeCommand.preview.accentColor}25 0%, rgba(0,0,0,0.4) 100%)`,
                          }
                        : undefined
                    }
                  >
                    {React.createElement(activeCommand.icon, {
                      className: "inspector-hero-icon",
                      style: activeCommand.preview?.accentColor
                        ? { color: activeCommand.preview.accentColor }
                        : undefined,
                    })}
                  </div>
                )}

                {/* Details Section */}
                <div className="inspector-details">
                  <h3 className="inspector-title">{activeCommand.title}</h3>

                  {/* Metadata Chips */}
                  {activeCommand.preview?.metaTags && (
                    <div className="inspector-chips-row">
                      {activeCommand.preview.metaTags.map((tag, i) => (
                        <span key={i} className="inspector-meta-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {activeCommand.preview?.metaLine2 && (
                    <div className="inspector-path-box">
                      <span className="path-label">Location</span>
                      <span className="path-text">{activeCommand.preview.metaLine2}</span>
                    </div>
                  )}

                  {activeCommand.preview?.description && (
                    <p className="inspector-desc">{activeCommand.preview.description}</p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="inspector-actions">
                  <button
                    type="button"
                    className="inspector-btn-primary"
                    onClick={() => activeCommand.action()}
                  >
                    <span>Execute Command</span>
                    <kbd className="action-key-pill">↵</kbd>
                  </button>

                  {activeCommand.preview?.filePath && (
                    <button
                      type="button"
                      className="inspector-btn-secondary"
                      onClick={() =>
                        void invoke("reveal_in_file_manager", {
                          path: activeCommand.preview?.filePath,
                        })
                      }
                    >
                      <FaFolderOpen />
                      <span>Reveal in Explorer</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="spotlight-inspector-empty">
                <FaBolt className="empty-bolt" />
                <span>Select an item to view preview</span>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER SHORTCUTS BAR */}
        <div className="spotlight-pro-footer">
          <div className="footer-keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Open</span>
            <span><kbd>TAB</kbd> Next Filter</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>

          <div className="footer-actions">
            <button
              type="button"
              className="footer-link-btn"
              onClick={() => void openUrl("https://discord.gg/bmXjTgsAaN")}
            >
              Discord Community
            </button>
            <button
              type="button"
              className="footer-link-btn"
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
