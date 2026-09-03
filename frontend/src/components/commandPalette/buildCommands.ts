import {
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
  FaColumns,
  FaVolumeUp,
  FaVolumeMute,
  FaExpand,
  FaSlidersH,
  FaCodeBranch,
  FaCalendarAlt,
} from "react-icons/fa";
import { CommandItem } from "./types";
import { ClipItem, EpisodeEntry, ScenepackEntry } from "../../types/domain";

const MIN_COLS = 1;
const MAX_COLS = 9;
const OPEN_SHORTCUT = "↵ Open";

export type CommandDeps = {
  episodes: EpisodeEntry[];
  episodeNamesById: Record<string, string>;
  scenepacks: ScenepackEntry[];
  clips: ClipItem[];
  selectedClips: Set<string>;
  pinned: boolean;
  sidebarEnabled: boolean;
  previewCollapsed: boolean;
  cols: number;
  audioPlaybackHover: boolean;
  episodesPath?: string | null;
  exportPath?: string | null;
  discordRPCEnabled: boolean;
  accentColor: string;
  closePalette: () => void;
  openEpisode: (id: string) => void;
  setActivePage: (page: string) => void;
  setSelectedScenepackId: (id: string) => void;
  setOpenedScenepackId: (id: string) => void;
  setSelectedClips: (clips: Set<string>) => void;
  setSidebarEnabled: (enabled: boolean) => void;
  setPreviewCollapsed: (collapsed: boolean) => void;
  setCols: (updater: (prev: number) => number) => void;
  setAudioPlaybackHover: (enabled: boolean) => void;
  togglePinned: () => void;
  openMenu: () => void;
  openSettings: (section: string) => void;
  onImportClick: () => void;
};

function episodeCommands(d: CommandDeps): CommandItem[] {
  return d.episodes.map((ep) => {
    const name =
      d.episodeNamesById[ep.id] ||
      ep.displayName ||
      ep.videoPath?.split(/[/\\]/).pop() ||
      `Episode ${ep.id}`;
    const clipCount = ep.clips?.length || 0;

    return {
      id: `ep-${ep.id}`,
      category: "episodes",
      title: name,
      subtitle: `${clipCount} cut scenes • ${ep.videoPath || "Ready in workspace"}`,
      badge: "Episode",
      icon: FaPlay,
      action: () => {
        d.openEpisode(ep.id);
        d.setActivePage("home");
        d.closePalette();
      },
      preview: {
        thumbnail: ep.clips?.[0]?.thumbnail || null,
        metaTags: [`${clipCount} Clips`, "Video Demux", "Workspace Ready"],
        metaLine1: name,
        metaLine2: ep.videoPath || "Local video file",
        filePath: ep.videoPath,
        description: "Immediately loads and streams all cut scenes into the grid timeline.",
        shortcut: OPEN_SHORTCUT,
      },
    };
  });
}

function scenepackCommands(d: CommandDeps): CommandItem[] {
  return d.scenepacks.map((sp) => {
    const count = sp.clips?.length || 0;
    return {
      id: `sp-${sp.id}`,
      category: "scenepacks",
      title: sp.name,
      subtitle: `${count} scenes in collection`,
      badge: "Scenepack",
      icon: FaLayerGroup,
      action: () => {
        d.setSelectedScenepackId(sp.id);
        d.setOpenedScenepackId(sp.id);
        d.setActivePage("scenepacks");
        d.closePalette();
      },
      preview: {
        thumbnail: sp.clips?.[0]?.thumbnail || null,
        metaTags: [`${count} Clips`, "Scenepack", "Collection"],
        metaLine1: sp.name,
        metaLine2: "Custom Scenepack Folder",
        description: "Browse, filter, and batch export clips collected in this scenepack.",
        shortcut: OPEN_SHORTCUT,
      },
    };
  });
}

function actionCommands(d: CommandDeps): CommandItem[] {
  return [
    {
      id: "act-import",
      category: "actions",
      title: "Import New Episode",
      subtitle: "Select video file to detect and cut into scene clips",
      badge: "Workspace",
      icon: FaFolderOpen,
      action: () => {
        d.closePalette();
        d.onImportClick();
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
      subtitle: `Highlight all ${d.clips.length} scenes in timeline`,
      badge: "Selection",
      icon: FaThLarge,
      action: () => {
        d.setSelectedClips(new Set(d.clips.map((c) => c.id)));
        d.closePalette();
      },
      preview: {
        metaTags: [`${d.clips.length} Available Clips`, "Timeline"],
        metaLine1: "Bulk Selection",
        description: "Selects every scene for batch export, merging, or scenepack grouping.",
        shortcut: "Ctrl+A",
      },
    },
    {
      id: "act-clear-select",
      category: "actions",
      title: "Clear Clip Selection",
      subtitle: `Deselect currently selected ${d.selectedClips.size} scenes`,
      badge: "Selection",
      icon: FaTimes,
      action: () => {
        d.setSelectedClips(new Set());
        d.closePalette();
      },
      preview: {
        metaTags: [`${d.selectedClips.size} Selected`],
        metaLine1: "Deselect All",
        description: "Clears selection state across the grid.",
      },
    },
    {
      id: "act-pin",
      category: "actions",
      title: d.pinned ? "Unpin Window (Normal Mode)" : "Pin Window (Always on Top)",
      subtitle: "Toggle floating companion window for After Effects / Premiere",
      badge: "Window",
      icon: FaThumbtack,
      action: () => {
        d.togglePinned();
        d.closePalette();
      },
      preview: {
        metaTags: [d.pinned ? "Currently Pinned" : "Normal Window", "Companion Size"],
        metaLine1: "Always on Top Mode",
        description: "Shrinks and pins AMVerge floating above your editing application.",
      },
    },
    {
      id: "act-toggle-sidebar",
      category: "actions",
      title: d.sidebarEnabled ? "Hide Sidebar" : "Show Sidebar",
      subtitle: "Toggle left navigation and episode tree panel",
      badge: "Layout",
      icon: FaFolder,
      action: () => {
        d.setSidebarEnabled(!d.sidebarEnabled);
        d.closePalette();
      },
      preview: {
        metaTags: [d.sidebarEnabled ? "Sidebar Visible" : "Sidebar Hidden", "Navigation"],
        metaLine1: "Sidebar Visibility",
        description: "Expands or collapses the left episode panel to save screen space.",
      },
    },
    {
      id: "act-toggle-preview",
      category: "actions",
      title: d.previewCollapsed ? "Show Video Preview Panel" : "Hide Video Preview Panel",
      subtitle: "Toggle the right preview player to expand clip grid full-width",
      badge: "Layout",
      icon: FaExpand,
      action: () => {
        d.setPreviewCollapsed(!d.previewCollapsed);
        d.closePalette();
      },
      preview: {
        metaTags: [d.previewCollapsed ? "Preview Folded" : "Preview Visible", "Grid Full-Width"],
        metaLine1: "Preview Pane Toggle",
        description: "Hides or restores the right video playback and export controls pane.",
      },
    },
    {
      id: "act-grid-zoom-in",
      category: "actions",
      title: "Grid: Zoom In (Larger Tiles)",
      subtitle: `Currently ${d.cols} columns per row`,
      badge: "Grid",
      icon: FaColumns,
      action: () => {
        d.setCols((prev) => Math.max(MIN_COLS, prev - 1));
        d.closePalette();
      },
      preview: {
        metaTags: [`Current: ${d.cols} cols`, "Grid Sizing"],
        metaLine1: "Bigger Clip Tiles",
        description: "Decreases columns to give each clip thumbnail more screen real estate.",
      },
    },
    {
      id: "act-grid-zoom-out",
      category: "actions",
      title: "Grid: Zoom Out (More Columns)",
      subtitle: `Currently ${d.cols} columns per row`,
      badge: "Grid",
      icon: FaColumns,
      action: () => {
        d.setCols((prev) => Math.min(MAX_COLS, prev + 1));
        d.closePalette();
      },
      preview: {
        metaTags: [`Current: ${d.cols} cols`, "Grid Sizing"],
        metaLine1: "Smaller Clip Tiles",
        description: "Increases columns to view more scene clips at a glance.",
      },
    },
    {
      id: "act-toggle-audio",
      category: "actions",
      title: d.audioPlaybackHover ? "Mute Audio on Hover" : "Enable Audio on Hover",
      subtitle: "Toggle clip hover sound in the scene grid",
      badge: "Audio",
      icon: d.audioPlaybackHover ? FaVolumeMute : FaVolumeUp,
      action: () => {
        d.setAudioPlaybackHover(!d.audioPlaybackHover);
        d.closePalette();
      },
      preview: {
        metaTags: [d.audioPlaybackHover ? "Audio: Active" : "Audio: Muted", "Hover Audio"],
        metaLine1: "Hover Audio Playback",
        description:
          "Controls whether hovering over a clip tile plays its synchronized audio track.",
      },
    },
  ];
}

function settingsCommands(d: CommandDeps): CommandItem[] {
  const openSection = (section: string) => () => {
    d.closePalette();
    d.openSettings(section);
  };

  return [
    {
      id: "set-general",
      category: "settings",
      title: "Settings: General",
      subtitle: "Scene detection methods, episodes storage path, and app defaults",
      badge: "Settings",
      icon: FaCog,
      action: openSection("general"),
      preview: {
        metaTags: ["Detection Method", "Storage Folder", "Transcode Quality"],
        metaLine1: "General Preferences",
        metaLine2: d.episodesPath || "Default Cache Directory",
        description: "Configure detection algorithms, cache locations, and video decode pipelines.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "set-export",
      category: "settings",
      title: "Settings: Export Profiles",
      subtitle: "GPU acceleration encoders (NVENC / AMF / QSV) and video codecs",
      badge: "Settings",
      icon: FaFileExport,
      action: openSection("export"),
      preview: {
        metaTags: ["NVENC / AMF / QSV", "H.264 / HEVC / AV1", "ProRes"],
        metaLine1: "Export Configuration",
        metaLine2: d.exportPath || "Default Export Folder",
        description: "Manage export encoders, bitrates, hardware profiles, and container formats.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "set-appearance",
      category: "settings",
      title: "Settings: Appearance",
      subtitle: "Custom colors, wallpaper background blur, and clip styling",
      badge: "Settings",
      icon: FaSlidersH,
      action: openSection("appearance"),
      preview: {
        metaTags: ["Accent Tint", "Custom Background", "Font Adjust"],
        metaLine1: "Visual Styling",
        metaLine2: `Accent: ${d.accentColor}`,
        description: "Personalize app colors, background images, opacity, and typography.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "set-deps",
      category: "settings",
      title: "Settings: AI Dependencies & Models",
      subtitle: "PyTorch CUDA environment, Depth-Map weights, and RIFE interpolation",
      badge: "Settings",
      icon: FaBolt,
      action: openSection("dependencies"),
      preview: {
        metaTags: ["TransNetV2", "RIFE Interpolation", "Depth Maps"],
        metaLine1: "AI Pack Ecosystem",
        description: "Check GPU status, install AI packs, and manage neural model weights.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "set-discord",
      category: "settings",
      title: "Settings: Discord Rich Presence",
      subtitle: "Configure Discord status badges, filenames, and rich details",
      badge: "Settings",
      icon: FaCodeBranch,
      action: openSection("discord"),
      preview: {
        metaTags: [d.discordRPCEnabled ? "RPC Enabled" : "RPC Disabled", "Discord"],
        metaLine1: "Discord RPC Integration",
        description: "Show your editing status and active clips count on Discord.",
        shortcut: OPEN_SHORTCUT,
      },
    },
  ];
}

function menuCommands(d: CommandDeps): CommandItem[] {
  // every menu entry opens the same window; the titles say which page it lands on
  const openMenuPage = () => {
    d.closePalette();
    d.openMenu();
  };

  return [
    {
      id: "community-events",
      category: "menu",
      title: "Community Events",
      subtitle: "Browse contests, collabs, and jams, or host your own",
      badge: "Community",
      icon: FaCalendarAlt,
      action: () => {
        d.closePalette();
        d.setActivePage("events");
      },
      preview: {
        metaTags: ["Contests", "Collabs", "Jams"],
        metaLine1: "Community Events",
        description: "Events hosted by the AMVerge community, reviewed before they appear.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "menu-console",
      category: "menu",
      title: "Developer Console Logs",
      subtitle: "Live CLI IPC events, backend streams, and diagnostic logs",
      badge: "System",
      icon: FaTerminal,
      action: openMenuPage,
      preview: {
        metaTags: ["CLI IPC", "Debug Output", "FFmpeg Logs"],
        metaLine1: "Diagnostic Console",
        description: "Inspect live stderr/stdout telemetry from FFmpeg, PyAV, and AI sidecars.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "menu-patchnotes",
      category: "menu",
      title: "Update Logs & Patch Notes",
      subtitle: "Read release history and new features in AMVerge v2",
      badge: "System",
      icon: FaHistory,
      action: openMenuPage,
      preview: {
        metaTags: ["Release v2.0", "Changelog", "Patch History"],
        metaLine1: "Version Release Logs",
        description: "Browse changelogs, bug fixes, and feature additions.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "menu-about",
      category: "menu",
      title: "About AMVerge",
      subtitle: "Architecture, system info, and open-source licenses",
      badge: "System",
      icon: FaInfoCircle,
      action: openMenuPage,
      preview: {
        metaTags: ["Tauri v2", "Rust Backend", "AMVerge CLI"],
        metaLine1: "About AMVerge Desktop",
        description: "High-performance anime & video scene cutter by Crptk & team.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "menu-bugreport",
      category: "menu",
      title: "Report a Bug / Issue",
      subtitle: "Submit feedback with diagnostic telemetry or connect to Discord",
      badge: "Support",
      icon: FaBug,
      action: openMenuPage,
      preview: {
        metaTags: ["HMAC Verified", "Bug Tracker", "Community"],
        metaLine1: "Feedback & Bug Reports",
        description: "Submit reproducible bugs directly to the development team.",
        shortcut: OPEN_SHORTCUT,
      },
    },
  ];
}

export function buildCommands(deps: CommandDeps): CommandItem[] {
  return [
    ...episodeCommands(deps),
    ...scenepackCommands(deps),
    ...actionCommands(deps),
    ...settingsCommands(deps),
    ...menuCommands(deps),
  ];
}
