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
  FaSearchPlus,
  FaWater,
  FaDatabase,
} from "react-icons/fa";
import { IoLibrary } from "react-icons/io5";
import { CommandItem } from "./types";
import { ClipItem, EpisodeEntry, ScenepackEntry } from "../../types/domain";
import type { ScoutDatabase } from "../../features/sceneScout/types";
import { featureDef, type FeatureId } from "../../features/featureToggles";

const MIN_COLS = 1;
const MAX_COLS = 9;
const OPEN_SHORTCUT = "↵ Open";

export type CommandDeps = {
  episodes: EpisodeEntry[];
  episodeNamesById: Record<string, string>;
  scenepacks: ScenepackEntry[];
  scoutDatabases: ScoutDatabase[];
  scoutDisplayNames: Record<string, string>;
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
  openScoutDatabase: (path: string) => void;
  openScoutMode: (mode: "search" | "flow") => void;
  inputFlowFile: () => void;
  featureState: (id: FeatureId) => { enabled: boolean; hidden: boolean };
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
      icon: FaPlay,
      action: () => {
        d.openEpisode(ep.id);
        d.setActivePage("home");
        d.closePalette();
      },
      preview: {
        thumbnail: ep.clips?.[0]?.thumbnail || null,
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
      feature: "scenepacks",
      title: sp.name,
      subtitle: `${count} scenes in collection`,
      icon: FaLayerGroup,
      action: () => {
        d.setSelectedScenepackId(sp.id);
        d.setOpenedScenepackId(sp.id);
        d.setActivePage("scenepacks");
        d.closePalette();
      },
      preview: {
        thumbnail: sp.clips?.[0]?.thumbnail || null,
        metaLine1: sp.name,
        metaLine2: "Custom Scenepack Folder",
        description: "Browse, filter, and batch export clips collected in this scenepack.",
        shortcut: OPEN_SHORTCUT,
      },
    };
  });
}

function sceneScoutCommands(d: CommandDeps): CommandItem[] {
  const databases: CommandItem[] = d.scoutDatabases.map((db) => {
    const name = d.scoutDisplayNames[db.path] || db.name;
    return {
      id: `scout-db-${db.path}`,
      category: "sceneScout",
      feature: "sceneScout",
      title: name,
      subtitle: `${db.videoCount} episodes • ${db.sceneCount} scenes`,
      icon: FaDatabase,
      action: () => {
        d.closePalette();
        d.openScoutDatabase(db.path);
      },
      preview: {
        metaLine1: name,
        metaLine2: db.path,
        filePath: db.path,
        description: "Opens this database in Scene Scout and searches it.",
        shortcut: OPEN_SHORTCUT,
      },
    };
  });

  return [
    {
      id: "scout-search",
      category: "sceneScout",
      feature: "sceneScout",
      title: "Scene Scout: Search",
      subtitle: "Find scenes by describing them",
      icon: FaSearchPlus,
      action: () => {
        d.closePalette();
        d.openScoutMode("search");
      },
      preview: {
        metaLine1: "Scene Scout Search",
        description: "Describe a scene in words and Scene Scout finds it across your databases.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "scout-flow",
      category: "sceneScout",
      feature: "sceneScout",
      title: "Scene Scout: Find flowing clips",
      subtitle: "Pick a video file and find scenes that could follow it",
      icon: FaWater,
      action: () => {
        d.closePalette();
        d.inputFlowFile();
      },
      preview: {
        metaLine1: "Flow Search",
        description: "Finds scenes that look like they follow the last frame of the file you pick.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    ...databases,
  ];
}

function actionCommands(d: CommandDeps): CommandItem[] {
  return [
    {
      id: "act-import",
      category: "actions",
      title: "Import New Episode",
      subtitle: "Select video file to detect and cut into scene clips",
      icon: FaFolderOpen,
      action: () => {
        d.closePalette();
        d.onImportClick();
      },
      preview: {
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
      icon: FaThLarge,
      action: () => {
        d.setSelectedClips(new Set(d.clips.map((c) => c.id)));
        d.closePalette();
      },
      preview: {
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
      icon: FaTimes,
      action: () => {
        d.setSelectedClips(new Set());
        d.closePalette();
      },
      preview: {
        metaLine1: "Deselect All",
        description: "Clears selection state across the grid.",
      },
    },
    {
      id: "act-pin",
      category: "actions",
      title: d.pinned ? "Unpin Window (Normal Mode)" : "Pin Window (Always on Top)",
      subtitle: "Toggle floating companion window for After Effects / Premiere",
      icon: FaThumbtack,
      action: () => {
        d.togglePinned();
        d.closePalette();
      },
      preview: {
        metaLine1: "Always on Top Mode",
        description: "Shrinks and pins AMVerge floating above your editing application.",
      },
    },
    {
      id: "act-toggle-sidebar",
      category: "actions",
      title: d.sidebarEnabled ? "Hide Sidebar" : "Show Sidebar",
      subtitle: "Toggle left navigation and episode tree panel",
      icon: FaFolder,
      action: () => {
        d.setSidebarEnabled(!d.sidebarEnabled);
        d.closePalette();
      },
      preview: {
        metaLine1: "Sidebar Visibility",
        description: "Expands or collapses the left episode panel to save screen space.",
      },
    },
    {
      id: "act-toggle-preview",
      category: "actions",
      title: d.previewCollapsed ? "Show Video Preview Panel" : "Hide Video Preview Panel",
      subtitle: "Toggle the right preview player to expand clip grid full-width",
      icon: FaExpand,
      action: () => {
        d.setPreviewCollapsed(!d.previewCollapsed);
        d.closePalette();
      },
      preview: {
        metaLine1: "Preview Pane Toggle",
        description: "Hides or restores the right video playback and export controls pane.",
      },
    },
    {
      id: "act-grid-zoom-in",
      category: "actions",
      title: "Grid: Zoom In (Larger Tiles)",
      subtitle: `Currently ${d.cols} columns per row`,
      icon: FaColumns,
      action: () => {
        d.setCols((prev) => Math.max(MIN_COLS, prev - 1));
        d.closePalette();
      },
      preview: {
        metaLine1: "Bigger Clip Tiles",
        description: "Decreases columns to give each clip thumbnail more screen real estate.",
      },
    },
    {
      id: "act-grid-zoom-out",
      category: "actions",
      title: "Grid: Zoom Out (More Columns)",
      subtitle: `Currently ${d.cols} columns per row`,
      icon: FaColumns,
      action: () => {
        d.setCols((prev) => Math.min(MAX_COLS, prev + 1));
        d.closePalette();
      },
      preview: {
        metaLine1: "Smaller Clip Tiles",
        description: "Increases columns to view more scene clips at a glance.",
      },
    },
    {
      id: "act-toggle-audio",
      category: "actions",
      title: d.audioPlaybackHover ? "Mute Audio on Hover" : "Enable Audio on Hover",
      subtitle: "Toggle clip hover sound in the scene grid",
      icon: d.audioPlaybackHover ? FaVolumeMute : FaVolumeUp,
      action: () => {
        d.setAudioPlaybackHover(!d.audioPlaybackHover);
        d.closePalette();
      },
      preview: {
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
      icon: FaCog,
      action: openSection("general"),
      preview: {
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
      icon: FaFileExport,
      action: openSection("export"),
      preview: {
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
      icon: FaSlidersH,
      action: openSection("appearance"),
      preview: {
        metaLine1: "Visual Styling",
        metaLine2: `Accent: ${d.accentColor}`,
        description: "Personalize app colors, background images, opacity, and typography.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "set-features",
      category: "settings",
      title: "Settings: Features",
      subtitle: "Turn AI Scene Detection, Scene Scout, Scenepacks and export passes on or off",
      icon: FaBolt,
      action: openSection("features"),
      preview: {
        metaLine1: "Features & storage",
        description: "Switch major features on or off, download what they need, and see how much disk space they use.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "set-discord",
      category: "settings",
      title: "Settings: Discord Rich Presence",
      subtitle: "Configure Discord status badges, filenames, and rich details",
      icon: FaCodeBranch,
      action: openSection("discord"),
      preview: {
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

  const goTo = (page: string) => () => {
    d.closePalette();
    d.setActivePage(page);
  };

  return [
    {
      id: "page-library",
      category: "menu",
      title: "Library",
      subtitle: "Your imported episodes and their clips",
      icon: IoLibrary,
      action: goTo("home"),
      preview: {
        metaLine1: "Library",
        description: "Back to the episode grid.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "page-scenepacks",
      category: "menu",
      feature: "scenepacks",
      title: "Scenepacks",
      subtitle: "Themed collections of clips",
      icon: FaLayerGroup,
      action: goTo("scenepacks"),
      preview: {
        metaLine1: "Scenepacks",
        description: "Browse and export the clips you grouped into Scenepacks.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "page-scene-scout",
      category: "menu",
      feature: "sceneScout",
      title: "Scene Scout",
      subtitle: "Search your episodes by describing a scene",
      icon: FaSearchPlus,
      action: goTo("sceneScout"),
      preview: {
        metaLine1: "Scene Scout",
        description: "Search indexed episodes by text, or find clips that flow into each other.",
        shortcut: OPEN_SHORTCUT,
      },
    },
    {
      id: "community-events",
      category: "menu",
      title: "Community Events",
      subtitle: "Browse contests, collabs, and jams, or host your own",
      icon: FaCalendarAlt,
      action: () => {
        d.closePalette();
        d.setActivePage("events");
      },
      preview: {
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
      icon: FaTerminal,
      action: openMenuPage,
      preview: {
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
      icon: FaHistory,
      action: openMenuPage,
      preview: {
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
      icon: FaInfoCircle,
      action: openMenuPage,
      preview: {
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
      icon: FaBug,
      action: openMenuPage,
      preview: {
        metaLine1: "Feedback & Bug Reports",
        description: "Submit reproducible bugs directly to the development team.",
        shortcut: OPEN_SHORTCUT,
      },
    },
  ];
}

// a switched-off feature's commands are left out when hidden, otherwise greyed out and point to Settings › Features
function applyFeatureToggles(commands: CommandItem[], d: CommandDeps): CommandItem[] {
  return commands.flatMap((cmd) => {
    if (!cmd.feature) return [cmd];
    const { enabled, hidden } = d.featureState(cmd.feature);
    if (enabled) return [cmd];
    if (hidden) return [];
    return [
      {
        ...cmd,
        disabled: true,
        subtitle: `Turn on ${featureDef(cmd.feature).label} in Settings › Features`,
        action: () => {
          d.closePalette();
          d.openSettings("features");
        },
      },
    ];
  });
}

export function buildCommands(deps: CommandDeps): CommandItem[] {
  return applyFeatureToggles(
    [
      ...episodeCommands(deps),
      ...scenepackCommands(deps),
      ...sceneScoutCommands(deps),
      ...actionCommands(deps),
      ...settingsCommands(deps),
      ...menuCommands(deps),
    ],
    deps
  );
}
