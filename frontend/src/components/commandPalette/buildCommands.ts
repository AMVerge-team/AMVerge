import { FaPlay, FaFolder, FaLayerGroup, FaBolt, FaCog, FaTerminal, FaBug, FaHistory, FaFolderOpen, FaThLarge, FaTimes, FaThumbtack, FaFileExport, FaInfoCircle, FaColumns, FaVolumeUp, FaVolumeMute, FaExpand, FaSlidersH, FaCodeBranch, FaCalendarAlt, FaSearchPlus, FaWater, FaDatabase } from '../icons/animated';
import { IoLibrary } from '../icons/animated';
import { CommandItem } from "./types";
import { ClipItem, EpisodeEntry, ScenepackEntry } from "../../types/domain";
import type { ScoutDatabase } from "../../features/sceneScout/types";
import type { FeatureId } from "../../features/featureToggles";
import { t } from "../../i18n";

const MIN_COLS = 1;
const MAX_COLS = 9;

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
  const openShortcut = t("shell:commands.openShortcut");
  return d.episodes.map((ep) => {
    const name =
      d.episodeNamesById[ep.id] ||
      ep.displayName ||
      ep.videoPath?.split(/[/\\]/).pop() ||
      t("shell:commands.episode.fallbackName", { id: ep.id });
    const clipCount = ep.clips?.length || 0;

    return {
      id: `ep-${ep.id}`,
      category: "episodes",
      title: name,
      subtitle: t("shell:commands.episode.subtitle", {
        count: clipCount,
        path: ep.videoPath || t("shell:commands.episode.readyInWorkspace"),
      }),
      icon: FaPlay,
      action: () => {
        d.openEpisode(ep.id);
        d.setActivePage("home");
        d.closePalette();
      },
      preview: {
        thumbnail: ep.clips?.[0]?.thumbnail || null,
        metaLine1: name,
        metaLine2: ep.videoPath || t("shell:commands.episode.localFile"),
        filePath: ep.videoPath,
        description: t("shell:commands.episode.description"),
        shortcut: openShortcut,
      },
    };
  });
}

function scenepackCommands(d: CommandDeps): CommandItem[] {
  const openShortcut = t("shell:commands.openShortcut");
  return d.scenepacks.map((sp) => {
    const count = sp.clips?.length || 0;
    return {
      id: `sp-${sp.id}`,
      category: "scenepacks",
      feature: "scenepacks",
      title: sp.name,
      subtitle: t("shell:commands.scenepack.subtitle", { count }),
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
        metaLine2: t("shell:commands.scenepack.meta"),
        description: t("shell:commands.scenepack.description"),
        shortcut: openShortcut,
      },
    };
  });
}

function sceneScoutCommands(d: CommandDeps): CommandItem[] {
  const openShortcut = t("shell:commands.openShortcut");
  const databases: CommandItem[] = d.scoutDatabases.map((db) => {
    const name = d.scoutDisplayNames[db.path] || db.name;
    return {
      id: `scout-db-${db.path}`,
      category: "sceneScout",
      feature: "sceneScout",
      title: name,
      subtitle: t("shell:commands.scoutDb.subtitle", {
        episodes: t("shell:commands.scoutDb.episodes", { count: db.videoCount }),
        scenes: t("shell:commands.scoutDb.scenes", { count: db.sceneCount }),
      }),
      icon: FaDatabase,
      action: () => {
        d.closePalette();
        d.openScoutDatabase(db.path);
      },
      preview: {
        metaLine1: name,
        metaLine2: db.path,
        filePath: db.path,
        description: t("shell:commands.scoutDb.description"),
        shortcut: openShortcut,
      },
    };
  });

  return [
    {
      id: "scout-search",
      category: "sceneScout",
      feature: "sceneScout",
      title: t("shell:commands.scoutSearch.title"),
      subtitle: t("shell:commands.scoutSearch.subtitle"),
      icon: FaSearchPlus,
      action: () => {
        d.closePalette();
        d.openScoutMode("search");
      },
      preview: {
        metaLine1: t("shell:commands.scoutSearch.meta"),
        description: t("shell:commands.scoutSearch.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "scout-flow",
      category: "sceneScout",
      feature: "sceneScout",
      title: t("shell:commands.scoutFlow.title"),
      subtitle: t("shell:commands.scoutFlow.subtitle"),
      icon: FaWater,
      action: () => {
        d.closePalette();
        d.inputFlowFile();
      },
      preview: {
        metaLine1: t("shell:commands.scoutFlow.meta"),
        description: t("shell:commands.scoutFlow.description"),
        shortcut: openShortcut,
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
      title: t("shell:commands.import.title"),
      subtitle: t("shell:commands.import.subtitle"),
      icon: FaFolderOpen,
      action: () => {
        d.closePalette();
        d.onImportClick();
      },
      preview: {
        metaLine1: t("shell:commands.import.meta"),
        description: t("shell:commands.import.description"),
        shortcut: "⌘I",
      },
    },
    {
      id: "act-select-all",
      category: "actions",
      title: t("shell:commands.selectAll.title"),
      subtitle: t("shell:commands.selectAll.subtitle", { count: d.clips.length }),
      icon: FaThLarge,
      action: () => {
        d.setSelectedClips(new Set(d.clips.map((c) => c.id)));
        d.closePalette();
      },
      preview: {
        metaLine1: t("shell:commands.selectAll.meta"),
        description: t("shell:commands.selectAll.description"),
        shortcut: "Ctrl+A",
      },
    },
    {
      id: "act-clear-select",
      category: "actions",
      title: t("shell:commands.clearSelection.title"),
      subtitle: t("shell:commands.clearSelection.subtitle", { count: d.selectedClips.size }),
      icon: FaTimes,
      action: () => {
        d.setSelectedClips(new Set());
        d.closePalette();
      },
      preview: {
        metaLine1: t("shell:commands.clearSelection.meta"),
        description: t("shell:commands.clearSelection.description"),
      },
    },
    {
      id: "act-pin",
      category: "actions",
      title: d.pinned ? t("shell:commands.pin.unpinTitle") : t("shell:commands.pin.pinTitle"),
      subtitle: t("shell:commands.pin.subtitle"),
      icon: FaThumbtack,
      action: () => {
        d.togglePinned();
        d.closePalette();
      },
      preview: {
        metaLine1: t("shell:commands.pin.meta"),
        description: t("shell:commands.pin.description"),
      },
    },
    {
      id: "act-toggle-sidebar",
      category: "actions",
      title: d.sidebarEnabled ? t("shell:commands.sidebar.hideTitle") : t("shell:commands.sidebar.showTitle"),
      subtitle: t("shell:commands.sidebar.subtitle"),
      icon: FaFolder,
      action: () => {
        d.setSidebarEnabled(!d.sidebarEnabled);
        d.closePalette();
      },
      preview: {
        metaLine1: t("shell:commands.sidebar.meta"),
        description: t("shell:commands.sidebar.description"),
      },
    },
    {
      id: "act-toggle-preview",
      category: "actions",
      title: d.previewCollapsed ? t("shell:commands.preview.showTitle") : t("shell:commands.preview.hideTitle"),
      subtitle: t("shell:commands.preview.subtitle"),
      icon: FaExpand,
      action: () => {
        d.setPreviewCollapsed(!d.previewCollapsed);
        d.closePalette();
      },
      preview: {
        metaLine1: t("shell:commands.preview.meta"),
        description: t("shell:commands.preview.description"),
      },
    },
    {
      id: "act-grid-zoom-in",
      category: "actions",
      title: t("shell:commands.zoomIn.title"),
      subtitle: t("shell:commands.columns", { count: d.cols }),
      icon: FaColumns,
      action: () => {
        d.setCols((prev) => Math.max(MIN_COLS, prev - 1));
        d.closePalette();
      },
      preview: {
        metaLine1: t("shell:commands.zoomIn.meta"),
        description: t("shell:commands.zoomIn.description"),
      },
    },
    {
      id: "act-grid-zoom-out",
      category: "actions",
      title: t("shell:commands.zoomOut.title"),
      subtitle: t("shell:commands.columns", { count: d.cols }),
      icon: FaColumns,
      action: () => {
        d.setCols((prev) => Math.min(MAX_COLS, prev + 1));
        d.closePalette();
      },
      preview: {
        metaLine1: t("shell:commands.zoomOut.meta"),
        description: t("shell:commands.zoomOut.description"),
      },
    },
    {
      id: "act-toggle-audio",
      category: "actions",
      title: d.audioPlaybackHover ? t("shell:commands.audio.muteTitle") : t("shell:commands.audio.enableTitle"),
      subtitle: t("shell:commands.audio.subtitle"),
      icon: d.audioPlaybackHover ? FaVolumeMute : FaVolumeUp,
      action: () => {
        d.setAudioPlaybackHover(!d.audioPlaybackHover);
        d.closePalette();
      },
      preview: {
        metaLine1: t("shell:commands.audio.meta"),
        description:
          t("shell:commands.audio.description"),
      },
    },
  ];
}

function settingsCommands(d: CommandDeps): CommandItem[] {
  const openShortcut = t("shell:commands.openShortcut");
  const openSection = (section: string) => () => {
    d.closePalette();
    d.openSettings(section);
  };

  return [
    {
      id: "set-general",
      category: "settings",
      title: t("shell:commands.settingsGeneral.title"),
      subtitle: t("shell:commands.settingsGeneral.subtitle"),
      icon: FaCog,
      action: openSection("general"),
      preview: {
        metaLine1: t("shell:commands.settingsGeneral.meta"),
        metaLine2: d.episodesPath || t("shell:commands.settingsGeneral.defaultPath"),
        description: t("shell:commands.settingsGeneral.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "set-export",
      category: "settings",
      title: t("shell:commands.settingsExport.title"),
      subtitle: t("shell:commands.settingsExport.subtitle"),
      icon: FaFileExport,
      action: openSection("export"),
      preview: {
        metaLine1: t("shell:commands.settingsExport.meta"),
        metaLine2: d.exportPath || t("shell:commands.settingsExport.defaultPath"),
        description: t("shell:commands.settingsExport.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "set-appearance",
      category: "settings",
      title: t("shell:commands.settingsAppearance.title"),
      subtitle: t("shell:commands.settingsAppearance.subtitle"),
      icon: FaSlidersH,
      action: openSection("appearance"),
      preview: {
        metaLine1: t("shell:commands.settingsAppearance.meta"),
        metaLine2: t("shell:commands.settingsAppearance.accent", { color: d.accentColor }),
        description: t("shell:commands.settingsAppearance.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "set-features",
      category: "settings",
      title: t("shell:commands.settingsFeatures.title"),
      subtitle: t("shell:commands.settingsFeatures.subtitle"),
      icon: FaBolt,
      action: openSection("features"),
      preview: {
        metaLine1: t("shell:commands.settingsFeatures.meta"),
        description: t("shell:commands.settingsFeatures.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "set-discord",
      category: "settings",
      title: t("shell:commands.settingsDiscord.title"),
      subtitle: t("shell:commands.settingsDiscord.subtitle"),
      icon: FaCodeBranch,
      action: openSection("discord"),
      preview: {
        metaLine1: t("shell:commands.settingsDiscord.meta"),
        description: t("shell:commands.settingsDiscord.description"),
        shortcut: openShortcut,
      },
    },
  ];
}

function menuCommands(d: CommandDeps): CommandItem[] {
  const openShortcut = t("shell:commands.openShortcut");
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
      title: t("shell:commands.library.title"),
      subtitle: t("shell:commands.library.subtitle"),
      icon: IoLibrary,
      action: goTo("home"),
      preview: {
        metaLine1: t("shell:commands.library.title"),
        description: t("shell:commands.library.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "page-scenepacks",
      category: "menu",
      feature: "scenepacks",
      title: t("shell:commands.scenepacks.title"),
      subtitle: t("shell:commands.scenepacks.subtitle"),
      icon: FaLayerGroup,
      action: goTo("scenepacks"),
      preview: {
        metaLine1: t("shell:commands.scenepacks.title"),
        description: t("shell:commands.scenepacks.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "page-scene-scout",
      category: "menu",
      feature: "sceneScout",
      title: t("shell:commands.sceneScout.title"),
      subtitle: t("shell:commands.sceneScout.subtitle"),
      icon: FaSearchPlus,
      action: goTo("sceneScout"),
      preview: {
        metaLine1: t("shell:commands.sceneScout.title"),
        description: t("shell:commands.sceneScout.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "community-events",
      category: "menu",
      title: t("shell:commands.events.title"),
      subtitle: t("shell:commands.events.subtitle"),
      icon: FaCalendarAlt,
      action: () => {
        d.closePalette();
        d.setActivePage("events");
      },
      preview: {
        metaLine1: t("shell:commands.events.title"),
        description: t("shell:commands.events.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "menu-console",
      category: "menu",
      title: t("shell:commands.console.title"),
      subtitle: t("shell:commands.console.subtitle"),
      icon: FaTerminal,
      action: openMenuPage,
      preview: {
        metaLine1: t("shell:commands.console.meta"),
        description: t("shell:commands.console.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "menu-patchnotes",
      category: "menu",
      title: t("shell:commands.patchNotes.title"),
      subtitle: t("shell:commands.patchNotes.subtitle"),
      icon: FaHistory,
      action: openMenuPage,
      preview: {
        metaLine1: t("shell:commands.patchNotes.meta"),
        description: t("shell:commands.patchNotes.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "menu-about",
      category: "menu",
      title: t("shell:commands.about.title"),
      subtitle: t("shell:commands.about.subtitle"),
      icon: FaInfoCircle,
      action: openMenuPage,
      preview: {
        metaLine1: t("shell:commands.about.meta"),
        description: t("shell:commands.about.description"),
        shortcut: openShortcut,
      },
    },
    {
      id: "menu-bugreport",
      category: "menu",
      title: t("shell:commands.bugReport.title"),
      subtitle: t("shell:commands.bugReport.subtitle"),
      icon: FaBug,
      action: openMenuPage,
      preview: {
        metaLine1: t("shell:commands.bugReport.meta"),
        description: t("shell:commands.bugReport.description"),
        shortcut: openShortcut,
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
        subtitle: t("shell:features.turnOn", { feature: t(`shell:features.${cmd.feature}`) }),
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
