import React, { useEffect, useState, useMemo, useRef } from "react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  FaSearch,
  FaPlay,
  FaFolder,
  FaLayerGroup,
  FaBolt,
  FaCog,
  FaTerminal,
  FaBug,
  FaHistory,
  FaFolderOpen,
  FaThLarge,
  FaTimes,
  FaThumbtack,
  FaFileExport,
  FaInfoCircle,
  FaAngleRight,
  FaColumns,
  FaVolumeUp,
  FaVolumeMute,
  FaExpand,
  FaSlidersH,
  FaCodeBranch,
  FaDiscord,
  FaGithub,
} from "react-icons/fa";
import { useUIStateStore } from "../stores/UIStore";
import { useEpisodePanelRuntimeStore, useEpisodePanelMetadataStore } from "../stores/episodeStore";
import { useScenepacksStore } from "../stores/scenepackStore";
import { useAppStateStore } from "../stores/appStore";
import { useGeneralSettingsStore, useThemeSettingsStore } from "../stores/settingsStore";
import { openEpisodeById } from "../hooks/useEpisodePanelState";
import useImportExport from "../hooks/useImportExport";

type CategoryFilter = "all" | "episodes" | "scenepacks" | "actions" | "settings" | "menu";

interface CommandItem {
  id: string;
  category: "episodes" | "scenepacks" | "actions" | "settings" | "menu";
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
    shortcut?: string;
    description?: string;
  };
}

const CATEGORY_CHIPS: { id: CategoryFilter; label: string; icon: any; prefix: string }[] = [
  { id: "all", label: "All", icon: FaSearch, prefix: "" },
  { id: "episodes", label: "Episodes", icon: FaPlay, prefix: "@" },
  { id: "scenepacks", label: "Scenepacks", icon: FaLayerGroup, prefix: "#" },
  { id: "actions", label: "Actions", icon: FaBolt, prefix: ">" },
  { id: "settings", label: "Settings", icon: FaCog, prefix: "?" },
  { id: "menu", label: "System & Menu", icon: FaTerminal, prefix: "/" },
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
  const previewCollapsed = useUIStateStore((s: any) => s.previewCollapsed);
  const setPreviewCollapsed = useUIStateStore((s: any) => s.setPreviewCollapsed);
  const cols = useUIStateStore((s: any) => s.cols);
  const setCols = useUIStateStore((s: any) => s.setCols);

  const episodes = useEpisodePanelRuntimeStore((s) => s.episodes);
  const episodeNamesById = useEpisodePanelMetadataStore((s) => s.episodeNamesById);
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const setSelectedScenepackId = useScenepacksStore((s) => s.setSelectedScenepackId);
  const setOpenedScenepackId = useScenepacksStore((s) => s.setOpenedScenepackId);

  const clips = useAppStateStore((s) => s.clips);
  const selectedClips = useAppStateStore((s) => s.selectedClips);
  const setSelectedClips = useAppStateStore((s) => s.setSelectedClips);

  const generalSettings = useGeneralSettingsStore();
  const themeSettings = useThemeSettingsStore();

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

  // Focus input on open
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setActiveFilter("all");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  // Parse prefixes or active chip filter
  const { effectiveFilter, cleanQuery } = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.startsWith("@")) return { effectiveFilter: "episodes" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    if (trimmed.startsWith("#")) return { effectiveFilter: "scenepacks" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    if (trimmed.startsWith(">")) return { effectiveFilter: "actions" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    if (trimmed.startsWith("?")) return { effectiveFilter: "settings" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
    if (trimmed.startsWith("/")) return { effectiveFilter: "menu" as CategoryFilter, cleanQuery: trimmed.slice(1).trim() };
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
        subtitle: `${clipCount} cut scenes • ${ep.videoPath || "Ready in workspace"}`,
        badge: "Episode",
        icon: FaPlay,
        action: () => {
          openEpisodeById(ep.id);
          setActivePage("home");
          setQuickMenuOpen(false);
        },
        preview: {
          thumbnail,
          metaTags: [`${clipCount} Clips`, "Video Demux", "Workspace Ready"],
          metaLine1: name,
          metaLine2: ep.videoPath || "Local video file",
          filePath: ep.videoPath,
          description: "Immediately loads and streams all cut scenes into the grid timeline.",
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
        subtitle: `${count} scenes in collection`,
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
          metaTags: [`${count} Clips`, "Scenepack", "Collection"],
          metaLine1: sp.name,
          metaLine2: "Custom Scenepack Folder",
          description: "Browse, filter, and batch export clips collected in this scenepack.",
          shortcut: "↵ Open",
        },
      });
    });

    // 3. WORKSPACE ACTIONS
    items.push(
      {
        id: "act-import",
        category: "actions",
        title: "Import New Episode",
        subtitle: "Select video file to detect and cut into scene clips",
        badge: "Workspace",
        icon: FaFolderOpen,
        action: () => {
          setQuickMenuOpen(false);
          onImportClick();
        },
        preview: {
          metaTags: ["Pipeline", "Scene Cut", "SmartCut Demux"],
          metaLine1: "Scene Detection Pipeline",
          description: "Open file dialog to run TransNetV2 AI or fast keyframe demux.",
          shortcut: "⌘I",
        },
      },
      {
        id: "act-select-all",
        category: "actions",
        title: "Select All Clips",
        subtitle: `Highlight all ${clips.length} scenes in timeline`,
        badge: "Selection",
        icon: FaThLarge,
        action: () => {
          setSelectedClips(new Set(clips.map((c) => c.id)));
          setQuickMenuOpen(false);
        },
        preview: {
          metaTags: [`${clips.length} Available Clips`, "Timeline"],
          metaLine1: "Bulk Selection",
          description: "Selects every scene for batch export, merging, or scenepack grouping.",
          shortcut: "Ctrl+A",
        },
      },
      {
        id: "act-clear-select",
        category: "actions",
        title: "Clear Clip Selection",
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
          description: "Clears selection state across the grid.",
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
          description: "Shrinks and pins AMVerge floating above your editing application.",
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
      },
      {
        id: "act-toggle-preview",
        category: "actions",
        title: previewCollapsed ? "Show Video Preview Panel" : "Hide Video Preview Panel",
        subtitle: "Toggle the right preview player to expand clip grid full-width",
        badge: "Layout",
        icon: FaExpand,
        action: () => {
          setPreviewCollapsed(!previewCollapsed);
          setQuickMenuOpen(false);
        },
        preview: {
          metaTags: [previewCollapsed ? "Preview Folded" : "Preview Visible", "Grid Full-Width"],
          metaLine1: "Preview Pane Toggle",
          description: "Hides or restores the right video playback and export controls pane.",
        },
      },
      {
        id: "act-grid-zoom-in",
        category: "actions",
        title: "Grid: Zoom In (Larger Tiles)",
        subtitle: `Currently ${cols} columns per row`,
        badge: "Grid",
        icon: FaColumns,
        action: () => {
          setCols((prev: number) => Math.max(1, prev - 1));
          setQuickMenuOpen(false);
        },
        preview: {
          metaTags: [`Current: ${cols} cols`, "Grid Sizing"],
          metaLine1: "Bigger Clip Tiles",
          description: "Decreases columns to give each clip thumbnail more screen real estate.",
        },
      },
      {
        id: "act-grid-zoom-out",
        category: "actions",
        title: "Grid: Zoom Out (More Columns)",
        subtitle: `Currently ${cols} columns per row`,
        badge: "Grid",
        icon: FaColumns,
        action: () => {
          setCols((prev: number) => Math.min(9, prev + 1));
          setQuickMenuOpen(false);
        },
        preview: {
          metaTags: [`Current: ${cols} cols`, "Grid Sizing"],
          metaLine1: "Smaller Clip Tiles",
          description: "Increases columns to view more scene clips at a glance.",
        },
      },
      {
        id: "act-toggle-audio",
        category: "actions",
        title: generalSettings.audioPlaybackHover ? "Mute Audio on Hover" : "Enable Audio on Hover",
        subtitle: "Toggle clip hover sound in the scene grid",
        badge: "Audio",
        icon: generalSettings.audioPlaybackHover ? FaVolumeMute : FaVolumeUp,
        action: () => {
          generalSettings.setAudioPlaybackHover(!generalSettings.audioPlaybackHover);
          setQuickMenuOpen(false);
        },
        preview: {
          metaTags: [generalSettings.audioPlaybackHover ? "Audio: Active" : "Audio: Muted", "Hover Audio"],
          metaLine1: "Hover Audio Playback",
          description: "Controls whether hovering over a clip tile plays its synchronized audio track.",
        },
      }
    );

    // 4. SETTINGS
    items.push(
      {
        id: "set-general",
        category: "settings",
        title: "Settings: General",
        subtitle: "Scene detection methods, episodes storage path, and app defaults",
        badge: "Settings",
        icon: FaCog,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("general");
        },
        preview: {
          metaTags: ["Detection Method", "Storage Folder", "Transcode Quality"],
          metaLine1: "General Preferences",
          metaLine2: generalSettings.episodesPath || "Default Cache Directory",
          description: "Configure detection algorithms, cache locations, and video decode pipelines.",
          shortcut: "↵ Open",
        },
      },
      {
        id: "set-export",
        category: "settings",
        title: "Settings: Export Profiles",
        subtitle: "GPU acceleration encoders (NVENC / AMF / QSV) and video codecs",
        badge: "Settings",
        icon: FaFileExport,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("export");
        },
        preview: {
          metaTags: ["NVENC / AMF / QSV", "H.264 / HEVC / AV1", "ProRes"],
          metaLine1: "Export Configuration",
          metaLine2: generalSettings.exportPath || "Default Export Folder",
          description: "Manage export encoders, bitrates, hardware profiles, and container formats.",
          shortcut: "↵ Open",
        },
      },
      {
        id: "set-appearance",
        category: "settings",
        title: "Settings: Appearance",
        subtitle: "Custom colors, wallpaper background blur, and clip styling",
        badge: "Settings",
        icon: FaSlidersH,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("appearance");
        },
        preview: {
          metaTags: ["Accent Tint", "Custom Background", "Font Adjust"],
          metaLine1: "Visual Styling",
          metaLine2: `Accent: ${themeSettings.accentColor}`,
          description: "Personalize app colors, background images, opacity, and typography.",
          shortcut: "↵ Open",
        },
      },
      {
        id: "set-deps",
        category: "settings",
        title: "Settings: AI Dependencies & Models",
        subtitle: "PyTorch CUDA environment, Depth-Map weights, and RIFE interpolation",
        badge: "Settings",
        icon: FaBolt,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("dependencies");
        },
        preview: {
          metaTags: ["TransNetV2", "RIFE Interpolation", "Depth Maps"],
          metaLine1: "AI Pack Ecosystem",
          description: "Check GPU status, install AI packs, and manage neural model weights.",
          shortcut: "↵ Open",
        },
      },
      {
        id: "set-discord",
        category: "settings",
        title: "Settings: Discord Rich Presence",
        subtitle: "Configure Discord status badges, filenames, and rich details",
        badge: "Settings",
        icon: FaCodeBranch,
        action: () => {
          setQuickMenuOpen(false);
          openSettings("discord");
        },
        preview: {
          metaTags: [generalSettings.discordRPCEnabled ? "RPC Enabled" : "RPC Disabled", "Discord"],
          metaLine1: "Discord RPC Integration",
          description: "Show your editing status and active clips count on Discord.",
          shortcut: "↵ Open",
        },
      }
    );

    // 5. SYSTEM & MENU
    items.push(
      {
        id: "menu-console",
        category: "menu",
        title: "Developer Console Logs",
        subtitle: "Live CLI IPC events, backend streams, and diagnostic logs",
        badge: "System",
        icon: FaTerminal,
        action: () => {
          setQuickMenuOpen(false);
          openMenu();
        },
        preview: {
          metaTags: ["CLI IPC", "Debug Output", "FFmpeg Logs"],
          metaLine1: "Diagnostic Console",
          description: "Inspect live stderr/stdout telemetry from FFmpeg, PyAV, and AI sidecars.",
          shortcut: "↵ Open",
        },
      },
      {
        id: "menu-patchnotes",
        category: "menu",
        title: "Update Logs & Patch Notes",
        subtitle: "Read release history and new features in AMVerge v2",
        badge: "System",
        icon: FaHistory,
        action: () => {
          setQuickMenuOpen(false);
          openMenu();
        },
        preview: {
          metaTags: ["Release v2.0", "Changelog", "Patch History"],
          metaLine1: "Version Release Logs",
          description: "Browse changelogs, bug fixes, and feature additions.",
          shortcut: "↵ Open",
        },
      },
      {
        id: "menu-about",
        category: "menu",
        title: "About AMVerge",
        subtitle: "Architecture, system info, and open-source licenses",
        badge: "System",
        icon: FaInfoCircle,
        action: () => {
          setQuickMenuOpen(false);
          openMenu();
        },
        preview: {
          metaTags: ["Tauri v2", "Rust Backend", "AMVerge CLI"],
          metaLine1: "About AMVerge Desktop",
          description: "High-performance anime & video scene cutter by Crptk & team.",
          shortcut: "↵ Open",
        },
      },
      {
        id: "menu-bugreport",
        category: "menu",
        title: "Report a Bug / Issue",
        subtitle: "Submit feedback with diagnostic telemetry or connect to Discord",
        badge: "Support",
        icon: FaBug,
        action: () => {
          setQuickMenuOpen(false);
          openMenu();
        },
        preview: {
          metaTags: ["HMAC Verified", "Bug Tracker", "Community"],
          metaLine1: "Feedback & Bug Reports",
          description: "Submit reproducible bugs directly to the development team.",
          shortcut: "↵ Open",
        },
      }
    );

    return items;
  }, [
    episodes,
    episodeNamesById,
    scenepacks,
    clips,
    selectedClips,
    pinned,
    sidebarEnabled,
    previewCollapsed,
    cols,
    generalSettings,
    themeSettings,
    onImportClick,
    setSelectedScenepackId,
    setOpenedScenepackId,
    openMenu,
    openSettings,
    setActivePage,
    setSelectedClips,
    setQuickMenuOpen,
    setSidebarEnabled,
    setPreviewCollapsed,
    setCols,
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
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setQuickMenuOpen(false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      // Cycle category filter
      const idx = CATEGORY_CHIPS.findIndex((c) => c.id === effectiveFilter);
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
              placeholder="Search episodes, scenepacks, actions, settings, menu..."
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
                  <div className="inspector-icon-hero">
                    {React.createElement(activeCommand.icon, {
                      className: "inspector-hero-icon",
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
                      <span className="path-label">Target</span>
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
              className="spotlight-footer-btn discord"
              onClick={() => void openUrl("https://discord.gg/bmXjTgsAaN")}
            >
              <FaDiscord />
              <span>Discord</span>
            </button>
            <button
              type="button"
              className="spotlight-footer-btn github"
              onClick={() => void openUrl("https://github.com/AMVerge-team/AMVerge")}
            >
              <FaGithub />
              <span>GitHub</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
