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
    /** language tag of the chosen track, resolved per clip at export time */
    previewAudioLanguage: string | null;
    playbackVolume: number;
    /** shared with the preview player's mute button, so it survives a clip switch */
    playbackMuted: boolean;
    discordRPCEnabled: boolean;
    rpcShowFilename: boolean;
    rpcShowMiniIcons: boolean;
    /** show the "elapsed" timer Discord counts from app launch */
    rpcShowElapsed: boolean;
    /** make the presence card's lines and art open the site / the server */
    rpcShowLinks: boolean;
    sceneDetectionMethod: SceneDetectionMethod;
    importMethod: importMethod;
    previewTranscodeMode: PreviewTranscodeMode;
    previewTranscodeQuality: PreviewTranscodeQuality;
    postExportPasses: PostExportPasses;
    scenepacksEnabled: boolean;
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
    // keyframe detection works on a fresh install; TransNetV2 needs the
    // optional AI pack, which the user opts into from Settings
    sceneDetectionMethod: "keyframe_detection",
    importMethod: "video_files",
    previewTranscodeMode: "hevc",
    previewTranscodeQuality: "480p",
    postExportPasses: DEFAULT_POST_EXPORT_PASSES,
    scenepacksEnabled: false,
    davinciResolveEnabled: false,
    davinciExportSelected: false,
};

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
                set({ previewTranscodeMode: mode }),
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
            updatePostExportPasses: (pass, changes) =>
                set((state) => ({
                    postExportPasses: {
                        ...state.postExportPasses,
                        [pass]: { ...state.postExportPasses[pass], ...changes },
                    },
                })),
        }),
        {
            name: "amverge.generalSettings.v2",
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

                return {
                    ...currentState,
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
                    previewTranscodeQuality:
                        persisted.previewTranscodeQuality !== undefined &&
                        persisted.previewTranscodeQuality in PREVIEW_TRANSCODE_PRESETS
                            ? persisted.previewTranscodeQuality
                            : currentState.previewTranscodeQuality,
                    postExportPasses: normalizePostExportPasses(persisted.postExportPasses),
                };
            },
        }
    )
);

import { convertFileSrc } from "@tauri-apps/api/core";

export type ThemeSettings = {
    accentColor: string; // hex, e.g. "#22c55e"
    backgroundGradientColor: string; // hex, e.g. "#001a00"
    backgroundImagePath: string | null;
    backgroundOpacity: number; // 0 to 1
    backgroundBlur: number; // pixels
    gridPreviewSpeed: number;
    appFontFamily: string | null; // null = default (Jersey 10 stack)
    appFontAdjust: number; // font-size-adjust, so a custom font matches the default's apparent size
    showDownloadButton: boolean;
    showClipTimestamps: boolean;
    widescreenClipTiles: boolean;
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
    widescreenClipTiles: false,
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

    // css color 4 slash syntax
    return `${r} ${g} ${b}`;
}

export const DEFAULT_FONT_STACK =
    "'Jersey 10', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function applyThemeSettings(settings: ThemeSettings) {
    const root = document.documentElement;
    const body = document.body;

    root.style.setProperty("--accent", settings.accentColor);
    body.style.setProperty("--accent", settings.accentColor);

    root.style.setProperty("--bg-accent", settings.backgroundGradientColor);
    body.style.setProperty("--bg-accent", settings.backgroundGradientColor);

    const rgb = hexToRgbTriplet(settings.accentColor);
    if (rgb) {
        root.style.setProperty("--accent-rgb", rgb);
        body.style.setProperty("--accent-rgb", rgb);
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

    // UI font from the Appearance picker, falling back to the default stack
    const appFont = settings.appFontFamily
        ? `"${settings.appFontFamily}", ${DEFAULT_FONT_STACK}`
        : DEFAULT_FONT_STACK;
    root.style.setProperty("--app-font", appFont);
    body.style.setProperty("--app-font", appFont);

    // most fonts render much larger than the pixel default at the same px size,
    // so a custom pick gets normalized by x-height. "none" leaves Jersey 10 be
    const fontAdjust = settings.appFontFamily
        ? String(settings.appFontAdjust ?? 0.47)
        : "none";
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
