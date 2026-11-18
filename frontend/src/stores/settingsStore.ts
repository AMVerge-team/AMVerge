import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
    createExportProfile,
    DEFAULT_EXPORT_PROFILE_ID,
    DEFAULT_EXPORT_PROFILES,
    normalizeExportProfile,
    type ExportProfile,
} from "../features/export/profiles";
import {
    DEFAULT_POST_EXPORT_PASSES,
    anyPassEnabled,
    normalizePostExportPasses,
    type PostExportPasses,
    type PostExportPassKind,
} from "../features/export/postPasses";

export type ExportFormat = "mp4" | "mov" | "xml";
export type SceneDetectionMethod = "transnetv2_gpu" | "keyframe_detection";
export type importMethod = "video_files" | "webp_files";

export type PreviewTranscodeMode = "off" | "hevc" | "always";
export type PreviewTranscodeQuality = "360p" | "480p" | "720p" | "1080p";

export const PREVIEW_TRANSCODE_PRESETS: Record<
    PreviewTranscodeQuality,
    { height: number; crf: number }
> = {
    "360p": { height: 360, crf: 32 },
    "480p": { height: 480, crf: 30 },
    "720p": { height: 720, crf: 28 },
    "1080p": { height: 1080, crf: 26 },
};

export type GeneralSettings = {
    episodesPath: string | null;
    exportFormat: "mp4" | "mov" | "xml";
    exportPath: string | null;
    mergeClipsEnabled: boolean;
    openFileLocationAfterExport: boolean;
    exportProfiles: ExportProfile[];
    customProfileIcons: string[];
    activeExportProfileId: string;
    audioPlaybackHover: boolean;
    previewAudioEnabled: boolean;
    previewAudioStreamIndex: number | null;
    previewAudioLanguage: string | null;
    playbackVolume: number;
    playbackMuted: boolean;
    discordRPCEnabled: boolean;
    rpcShowFilename: boolean;
    rpcShowMiniIcons: boolean;
    rpcShowElapsed: boolean;
    rpcShowLinks: boolean;
    sceneDetectionMethod: SceneDetectionMethod;
    importMethod: importMethod;
    previewTranscodeMode: PreviewTranscodeMode;
    /** true once the user picks a mode in Settings; until then the HEVC check picks it (off when this PC plays HEVC) */
    previewTranscodeModeUserSet: boolean;
    previewTranscodeQuality: PreviewTranscodeQuality;
    postExportPasses: PostExportPasses;
    postExportPassesEnabled: boolean;
    scenepacksEnabled: boolean;
    /** Settings > Features switches (see features/featureToggles.ts) */
    aiSceneDetectionEnabled: boolean;
    sceneScoutEnabled: boolean;
    depthPassEnabled: boolean;
    upscalePassEnabled: boolean;
    /** a switched-off feature disappears from the ui instead of being greyed out */
    hideDisabledFeatures: boolean;
    davinciResolveEnabled: boolean;
    davinciExportSelected: boolean;
};

export type GeneralSettingsStore = GeneralSettings & {
    setEpisodesPath: (path: string | null) => void;
    setExportFormat: (format: ExportFormat) => void;
    setExportPath: (path: string | null) => void;
    setMergeClipsEnabled: (enabled: boolean) => void;
    setOpenFileLocationAfterExport: (enabled: boolean) => void;
    setActiveExportProfileId: (profileId: string) => void;
    addExportProfile: () => void;
    deleteExportProfile: (profileId: string) => void;
    updateExportProfile: (profileId: string, changes: Partial<ExportProfile>) => void;
    addCustomProfileIcon: (iconPath: string) => void;
    removeCustomProfileIcon: (iconPath: string) => void;
    setAudioPlaybackHover: (enabled: boolean) => void;
    setPreviewAudioEnabled: (enabled: boolean) => void;
    setPreviewAudioStreamIndex: (index: number | null) => void;
    setPreviewAudioLanguage: (language: string | null) => void;
    setPlaybackVolume: (volume: number) => void;
    setPlaybackMuted: (muted: boolean) => void;
    setDiscordRPCEnabled: (enabled: boolean) => void;
    setRpcShowFilename: (enabled: boolean) => void;
    setRpcShowMiniIcons: (enabled: boolean) => void;
    setRpcShowElapsed: (enabled: boolean) => void;
    setRpcShowLinks: (enabled: boolean) => void;
    setScenepacksEnabled: (enabled: boolean) => void;
    setDavinciResolveEnabled: (enabled: boolean) => void;
    setDavinciExportSelected: (selected: boolean) => void;
    resetGeneralSettings: () => void;
    setSceneDetectionMethod: (method: SceneDetectionMethod) => void;
    setImportMethod: (method: importMethod) => void;
    setPreviewTranscodeMode: (mode: PreviewTranscodeMode) => void;
    setPreviewTranscodeQuality: (quality: PreviewTranscodeQuality) => void;
    setPostExportPassesEnabled: (enabled: boolean) => void;
    updatePostExportPasses: <K extends PostExportPassKind>(
        pass: K,
        changes: Partial<PostExportPasses[K]>,
    ) => void;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
    episodesPath: null,
    exportFormat: "mp4",
    exportPath: null,
    mergeClipsEnabled: true,
    openFileLocationAfterExport: true,
    exportProfiles: DEFAULT_EXPORT_PROFILES.map((profile) => ({ ...profile })),
    customProfileIcons: [],
    activeExportProfileId: DEFAULT_EXPORT_PROFILE_ID,
    audioPlaybackHover: false,
    previewAudioEnabled: false,
    previewAudioStreamIndex: null,
    previewAudioLanguage: null,
    playbackVolume: 0.2,
    playbackMuted: false,
    discordRPCEnabled: true,
    rpcShowFilename: true,
    rpcShowMiniIcons: true,
    rpcShowElapsed: true,
    rpcShowLinks: true,
    sceneDetectionMethod: "keyframe_detection",
    importMethod: "video_files",
    previewTranscodeMode: "hevc",
    previewTranscodeModeUserSet: false,
    previewTranscodeQuality: "480p",
    postExportPasses: DEFAULT_POST_EXPORT_PASSES,
    postExportPassesEnabled: false,
    scenepacksEnabled: false,
    // a fresh install starts with every feature off; switching one on downloads what it needs
    aiSceneDetectionEnabled: false,
    sceneScoutEnabled: false,
    depthPassEnabled: false,
    upscalePassEnabled: false,
    hideDisabledFeatures: false,
    davinciResolveEnabled: false,
    davinciExportSelected: false,
};

const LEGACY_FAST_REMUX_PROFILE_ID = "remux-fast-mov";
const LEGACY_FAST_REMUX_PROFILE_NAME = "Fast Remux MOV";
const AUTO_FAST_REMUX_PROFILE_NAME = "Fast Remux (Auto Container)";

/** relabels the shipped Fast remux preset now that it takes the source container; user profiles untouched */
export function migrateLegacyFastRemuxProfile(profile: ExportProfile): ExportProfile {
    if (
        profile.id !== LEGACY_FAST_REMUX_PROFILE_ID ||
        profile.workflow !== "video_remux" ||
        profile.name !== LEGACY_FAST_REMUX_PROFILE_NAME
    ) {
        return profile;
    }

    return { ...profile, name: AUTO_FAST_REMUX_PROFILE_NAME };
}

export const useGeneralSettingsStore = create<GeneralSettingsStore>()(
    persist(
        (set) => ({
            ...DEFAULT_GENERAL_SETTINGS,

            setEpisodesPath: (path) => set({ episodesPath: path }),
            setExportFormat: (format) => set({ exportFormat: format }),
            setExportPath: (path) => set({ exportPath: path }),
            setMergeClipsEnabled: (enabled) => set({ mergeClipsEnabled: enabled }),
            setOpenFileLocationAfterExport: (enabled) => set({ openFileLocationAfterExport: enabled }),
            setActiveExportProfileId: (profileId) =>
                set((state) => {
                    if (!state.exportProfiles.some((profile) => profile.id === profileId)) {
                        return {};
                    }
                    return { activeExportProfileId: profileId };
                }),
            addExportProfile: () =>
                set((state) => {
                    const profile = createExportProfile(state.exportProfiles.length + 1);
                    return {
                        exportProfiles: [...state.exportProfiles, profile],
                        activeExportProfileId: profile.id,
                    };
                }),
            deleteExportProfile: (profileId) =>
                set((state) => {
                    if (state.exportProfiles.length <= 1) {
                        return {};
                    }

                    const exportProfiles = state.exportProfiles.filter((profile) => profile.id !== profileId);
                    if (exportProfiles.length === state.exportProfiles.length) {
                        return {};
                    }

                    return {
                        exportProfiles,
                        activeExportProfileId:
                            state.activeExportProfileId === profileId
                                ? exportProfiles[0].id
                                : state.activeExportProfileId,
                    };
                }),
            updateExportProfile: (profileId, changes) =>
                set((state) => ({
                    exportProfiles: state.exportProfiles.map((profile) =>
                        profile.id === profileId
                            ? normalizeExportProfile({ ...profile, ...changes, id: profile.id })
                            : profile
                    ),
                })),
            addCustomProfileIcon: (iconPath) =>
                set((state) => {
                    const normalizedPath = iconPath.split("?")[0];
                    if (!normalizedPath) return {};
                    const alreadyExists = state.customProfileIcons.some(
                        (path) => path.split("?")[0] === normalizedPath
                    );
                    if (alreadyExists) return {};
                    return { customProfileIcons: [...state.customProfileIcons, normalizedPath] };
                }),
            removeCustomProfileIcon: (iconPath) =>
                set((state) => {
                    const normalizedPath = iconPath.split("?")[0];
                    const customProfileIcons = state.customProfileIcons.filter(
                        (path) => path.split("?")[0] !== normalizedPath
                    );

                    const exportProfiles = state.exportProfiles.map((profile) => {
                        const profileCustomPath = (profile.customIconPath || "").split("?")[0];
                        if (profile.icon === "custom" && profileCustomPath === normalizedPath) {
                            return normalizeExportProfile({
                                ...profile,
                                icon: "video",
                                customIconPath: null,
                            });
                        }
                        return profile;
                    });

                    return {
                        customProfileIcons,
                        exportProfiles,
                    };
                }),
            setSceneDetectionMethod: (method) => 
                set({ sceneDetectionMethod: method }),
            setImportMethod: (method) =>
                set({ importMethod: method }),
            setPreviewTranscodeMode: (mode) =>
                set({ previewTranscodeMode: mode, previewTranscodeModeUserSet: true }),
            setPreviewTranscodeQuality: (quality) =>
                set({ previewTranscodeQuality: quality }),
            setAudioPlaybackHover: (enabled) =>
                set({ audioPlaybackHover: enabled }),
            setPreviewAudioEnabled: (enabled) =>
                set({ previewAudioEnabled: enabled }),
            setPreviewAudioLanguage: (previewAudioLanguage) =>
                set((s) =>
                    s.previewAudioLanguage === previewAudioLanguage
                        ? s
                        : { previewAudioLanguage }
                ),
            setPreviewAudioStreamIndex: (index) =>
                set((s) =>
                    s.previewAudioStreamIndex === index
                        ? s
                        : { previewAudioStreamIndex: index }
                ),
            setPlaybackVolume: (volume) => set({ playbackVolume: volume }),
            setPlaybackMuted: (muted) => set({ playbackMuted: muted }),
            setDiscordRPCEnabled: (enabled) =>
                set({ discordRPCEnabled: enabled }),
            setRpcShowFilename: (enabled) =>
                set({ rpcShowFilename: enabled }),
            setRpcShowMiniIcons: (enabled) =>
                set({ rpcShowMiniIcons: enabled }),
            setRpcShowElapsed: (enabled) =>
                set({ rpcShowElapsed: enabled }),
            setRpcShowLinks: (enabled) =>
                set({ rpcShowLinks: enabled }),
            setScenepacksEnabled: (enabled) =>
                set({ scenepacksEnabled: enabled }),
            setDavinciResolveEnabled: (enabled) =>
                set({ davinciResolveEnabled: enabled }),
            setDavinciExportSelected: (selected) =>
                set({ davinciExportSelected: selected }),

            resetGeneralSettings: () => set(DEFAULT_GENERAL_SETTINGS),
            setPostExportPassesEnabled: (enabled) => set({ postExportPassesEnabled: enabled }),
            updatePostExportPasses: (pass, changes) =>
                set((state) => ({
                    ...(changes.enabled === true ? { postExportPassesEnabled: true } : {}),
                    postExportPasses: {
                        ...state.postExportPasses,
                        [pass]: { ...state.postExportPasses[pass], ...changes },
                    },
                })),
        }),
        {
            name: "amverge.generalSettings.v2",
            version: 1,
            migrate: (persistedState, version) => {
                const persisted = (persistedState || {}) as Partial<GeneralSettings>;
                if (version >= 1 || !Array.isArray(persisted.exportProfiles)) {
                    return persisted;
                }

                return {
                    ...persisted,
                    exportProfiles: persisted.exportProfiles.map((profile) =>
                        migrateLegacyFastRemuxProfile(profile as ExportProfile)
                    ),
                };
            },
            merge: (persistedState, currentState) => {
                const persisted = (persistedState || {}) as Partial<GeneralSettings>;

                const persistedProfiles = Array.isArray(persisted.exportProfiles)
                    ? persisted.exportProfiles.map((profile) =>
                        normalizeExportProfile(profile as ExportProfile)
                    )
                    : currentState.exportProfiles;

                const activeExportProfileId =
                    persisted.activeExportProfileId &&
                    persistedProfiles.some((profile) => profile.id === persisted.activeExportProfileId)
                        ? persisted.activeExportProfileId
                        : (persistedProfiles[0]?.id ?? DEFAULT_EXPORT_PROFILE_ID);

                const rawExportFormat = persisted.exportFormat;
                const exportFormat: ExportFormat =
                    rawExportFormat === "mov" || rawExportFormat === "xml"
                        ? rawExportFormat
                        : "mp4";

                // settings saved before these switches existed had every feature on; an update keeps it that way
                const featuresBeforeToggles =
                    persistedState && persisted.aiSceneDetectionEnabled === undefined
                        ? {
                              aiSceneDetectionEnabled: true,
                              sceneScoutEnabled: true,
                              depthPassEnabled: true,
                          }
                        : {};

                return {
                    ...currentState,
                    ...featuresBeforeToggles,
                    ...persisted,
                    exportProfiles: persistedProfiles,
                    activeExportProfileId,
                    exportFormat,
                    sceneDetectionMethod:
                        persisted.sceneDetectionMethod === "keyframe_detection" ||
                        persisted.sceneDetectionMethod === "transnetv2_gpu"
                            ? persisted.sceneDetectionMethod
                            : currentState.sceneDetectionMethod,
                    importMethod:
                        persisted.importMethod === "webp_files" ||
                        persisted.importMethod === "video_files"
                            ? persisted.importMethod
                            : currentState.importMethod,
                    previewTranscodeMode:
                        persisted.previewTranscodeMode === "off" ||
                        persisted.previewTranscodeMode === "hevc" ||
                        persisted.previewTranscodeMode === "always"
                            ? persisted.previewTranscodeMode
                            : currentState.previewTranscodeMode,
                    // settings saved before this flag never made a choice the app can tell apart from the default
                    previewTranscodeModeUserSet: persisted.previewTranscodeModeUserSet === true,
                    previewTranscodeQuality:
                        persisted.previewTranscodeQuality !== undefined &&
                        persisted.previewTranscodeQuality in PREVIEW_TRANSCODE_PRESETS
                            ? persisted.previewTranscodeQuality
                            : currentState.previewTranscodeQuality,
                    postExportPasses: normalizePostExportPasses(persisted.postExportPasses),
                    postExportPassesEnabled: typeof persisted.postExportPassesEnabled === "boolean"
                        ? persisted.postExportPassesEnabled
                        : anyPassEnabled(normalizePostExportPasses(persisted.postExportPasses)),
                };
            },
        }
    )
);

import { convertFileSrc } from "@tauri-apps/api/core";

export type ThemeSettings = {
    accentColor: string;
    backgroundGradientColor: string;
    backgroundImagePath: string | null;
    backgroundOpacity: number;
    backgroundBlur: number;
    gridPreviewSpeed: number;
    appFontFamily: string | null;
    appFontAdjust: number;
    showDownloadButton: boolean;
    showClipTimestamps: boolean;
    /** clip tiles show "start - end" instead of only the start */
    showClipEndTime: boolean;
    /** clip tiles show duration in the bottom left on Library and Scene Scout */
    showClipDuration: boolean;
    widescreenClipTiles: boolean;
    /** tint of the left episode panel's list box, drawn at 22% over the background */
    episodePanelColor: string;
};

export type ThemeSettingsStore = ThemeSettings & {
    setAccentColor: (accent: string) => void;
    setBackgroundGradientColor: (gradientColor: string) => void;
    setBackgroundImagePath: (imagePath: string | null) => void;
    setBackgroundOpacity: (opacity: number) => void;
    setBackgroundBlur: (blur: number) => void;
    setGridPreviewSpeed: (speed: number) => void;
    setAppFontFamily: (font: string | null) => void;
    setAppFontAdjust: (adjust: number) => void;
    setShowDownloadButton: (showDownloadButton: boolean) => void;
    setShowClipTimestamps: (showClipTimestamps: boolean) => void;
    setShowClipDuration: (showClipDuration: boolean) => void;
    setWidescreenClipTiles: (widescreenClipTiles: boolean) => void;
    resetThemeSettings: () => void;
};

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
    accentColor: "#22c55e",
    backgroundGradientColor: "#001a00",
    backgroundImagePath: null,
    backgroundOpacity: 1.0,
    backgroundBlur: 0,
    gridPreviewSpeed: 1,
    appFontFamily: null,
    appFontAdjust: 0.47,
    showDownloadButton: true,
    showClipTimestamps: true,
    showClipEndTime: true,
    showClipDuration: false,
    widescreenClipTiles: false,
    // black at 22% is the v2.0.2 panel, so updating doesn't change how it looks
    episodePanelColor: "#000000",
};

export const useThemeSettingsStore = create<ThemeSettingsStore>()(
    persist(
        (set) => ({
            ...DEFAULT_THEME_SETTINGS,

            setAccentColor: (accent) => {
                console.log("Accent color setting..");
                set({ accentColor: accent });
            },
            setBackgroundGradientColor: (gradientColor) => {
                console.log("Background gradient changing..")
                set({ backgroundGradientColor: gradientColor })
            },
            setBackgroundImagePath: (imagePath) => {
                console.log("Changing background image...")
                set({ backgroundImagePath: imagePath })
            },
            setBackgroundOpacity: (opacity) => {
                console.log("Setting background opacity..")
                set({ backgroundOpacity: opacity })
            },
            setBackgroundBlur: (blur) => {
                console.log("Setting background blur..")
                set({ backgroundBlur: blur })
            },
            setGridPreviewSpeed: (speed) => {
                const clamped = Math.max(0.25, Math.min(3, speed));
                set({ gridPreviewSpeed: clamped });
            },
            setAppFontFamily: (font) => set({ appFontFamily: font }),
            setAppFontAdjust: (adjust) =>
                set({ appFontAdjust: Math.max(0.3, Math.min(0.7, adjust)) }),
            setShowDownloadButton: (showDownloadButton) => {
                console.log("Toggling download button..")
                set({ showDownloadButton: showDownloadButton })
            },
            setShowClipTimestamps: (showClipTimestamps) => {
                console.log("Setting clip timestamps..")
                set({ showClipTimestamps: showClipTimestamps })
            },
            setShowClipDuration: (showClipDuration) => {
                set({ showClipDuration })
            },
            setWidescreenClipTiles: (widescreenClipTiles) => {
                set({ widescreenClipTiles })
            },
            resetThemeSettings: () => {
                console.log("Resetting theme..")
                set({ ...DEFAULT_THEME_SETTINGS })
            },
        }),
        {
            name: "amverge.theme.v2",
            version: 2,
            migrate: (persisted, version) => {
                const state = (persisted ?? {}) as Partial<ThemeSettings>;
                if (version < 2) {
                    return {
                        ...DEFAULT_THEME_SETTINGS,
                        ...state,
                        // v2.0.2 enables "Show end time" by default for existing profiles once
                        showClipEndTime: true,
                        showClipDuration: state.showClipDuration ?? false,
                    };
                }
                return { ...DEFAULT_THEME_SETTINGS, ...state };
            },
        }
    )
);

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv", "avi", "m4v"]);

function getPathExtension(path: string): string {
    const cleanPath = path.split("?")[0];
    const dotIndex = cleanPath.lastIndexOf(".");
    if (dotIndex < 0) return "";
    return cleanPath.slice(dotIndex + 1).toLowerCase();
}

export function isVideoBackgroundPath(path: string | null | undefined): boolean {
    if (!path) return false;
    return VIDEO_EXTENSIONS.has(getPathExtension(path));
}

function clampByte(value: number) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgbTriplet(hex: string): string | null {
    const cleaned = hex.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;

    const r = clampByte(parseInt(cleaned.slice(0, 2), 16));
    const g = clampByte(parseInt(cleaned.slice(2, 4), 16));
    const b = clampByte(parseInt(cleaned.slice(4, 6), 16));

    return `${r} ${g} ${b}`;
}

const CJK_FALLBACK_STACK =
    "'Noto Sans SC Variable', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei'";

// use the native windows ui font with platform and chinese fallbacks
export const DEFAULT_FONT_STACK =
    `'Segoe UI Variable Text', 'Segoe UI', ${CJK_FALLBACK_STACK}, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;

/** the bundled pixel font, offered right under the default; paired with a bundled chinese pixel font */
export const JERSEY_FONT = "Jersey 10";
export const CJK_PIXEL_FONT = "Fusion Pixel 12px Proportional SC";
const JERSEY_FONT_STACK =
    `'Jersey 10', '${CJK_PIXEL_FONT}', system-ui, -apple-system, BlinkMacSystemFont, ${CJK_FALLBACK_STACK}, sans-serif`;

// null uses the system default; jersey 10 keeps its chinese pixel pair
export function fontStackFor(family: string | null): string {
    if (family === JERSEY_FONT) return JERSEY_FONT_STACK;
    if (family) return `"${family}", ${DEFAULT_FONT_STACK}`;
    return DEFAULT_FONT_STACK;
}

export function applyThemeSettings(settings: ThemeSettings) {
    const root = document.documentElement;
    const body = document.body;

    root.style.setProperty("--accent", settings.accentColor);
    body.style.setProperty("--accent", settings.accentColor);

    root.style.setProperty("--bg-accent", settings.backgroundGradientColor);
    body.style.setProperty("--bg-accent", settings.backgroundGradientColor);

    // the gradient's far stop needs a triplet so it can carry the reveal alpha
    const bgRgb = hexToRgbTriplet(settings.backgroundGradientColor);
    if (bgRgb) {
        root.style.setProperty("--bg-accent-rgb", bgRgb);
        body.style.setProperty("--bg-accent-rgb", bgRgb);
    }

    const rgb = hexToRgbTriplet(settings.accentColor);
    if (rgb) {
        root.style.setProperty("--accent-rgb", rgb);
        body.style.setProperty("--accent-rgb", rgb);
    }

    const panelRgb = hexToRgbTriplet(settings.episodePanelColor ?? DEFAULT_THEME_SETTINGS.episodePanelColor);
    if (panelRgb) {
        root.style.setProperty("--episode-panel-rgb", panelRgb);
        body.style.setProperty("--episode-panel-rgb", panelRgb);
    }

    let bgValue = "none";
    if (settings.backgroundImagePath && !isVideoBackgroundPath(settings.backgroundImagePath)) {
        const [cleanPath, query] = settings.backgroundImagePath.split("?");
        const src = convertFileSrc(cleanPath);
        bgValue = query ? `url("${src}?${query}")` : `url("${src}")`;
    }

    root.style.setProperty("--app-bg-image", bgValue);
    body.style.setProperty("--app-bg-image", bgValue);

    root.style.setProperty("--app-bg-opacity", String(settings.backgroundOpacity));
    body.style.setProperty("--app-bg-opacity", String(settings.backgroundOpacity));

    root.style.setProperty("--app-bg-blur", `${settings.backgroundBlur}px`);
    body.style.setProperty("--app-bg-blur", `${settings.backgroundBlur}px`);

    const clipTileAspect = settings.widescreenClipTiles ? "16 / 9" : "1 / 1";
    root.style.setProperty("--clip-tile-aspect", clipTileAspect);
    body.style.setProperty("--clip-tile-aspect", clipTileAspect);

    const family = settings.appFontFamily;
    const appFont = fontStackFor(family);
    root.style.setProperty("--app-font", appFont);
    body.style.setProperty("--app-font", appFont);

    // keep native proportions at the default size and retain explicit size adjustments
    const sizeAdjust = (settings.appFontAdjust ?? 0.47) * (family ? 1 : 0.52 / 0.47);
    const nativeDefault = !family && Math.abs((settings.appFontAdjust ?? 0.47) - 0.47) < 0.0001;
    const fontAdjust = family === JERSEY_FONT || nativeDefault ? "none" : String(sizeAdjust);
    root.style.setProperty("--app-font-adjust", fontAdjust);
    body.style.setProperty("--app-font-adjust", fontAdjust);
}

export function getDarkerColor(hex: string, factor = 0.5): string {
    const cleaned = hex.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return "#000000";

    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);

    const dr = clampByte(r * factor);
    const dg = clampByte(g * factor);
    const db = clampByte(b * factor);

    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${toHex(dr)}${toHex(dg)}${toHex(db)}`;
}
