import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGeneralSettingsStore } from "../stores/settingsStore";
import { useUIStateStore } from "../stores/UIStore";
import { useAppStateStore } from "../stores/appStore";
import {
    useEpisodePanelMetadataStore,
    useEpisodePanelRuntimeStore,
} from "../stores/episodeStore";

/** What a caller describes: the activity itself, without the display toggles. */
export type RPCActivity = {
    details?: string;
    state?: string;
    large_image?: string;
    small_image?: string;
    small_text?: string;
};

/** The activity payload Discord receives, mirrored for the settings preview. */
export type DiscordActivity = {
    details?: string;
    details_url?: string;
    state?: string;
    state_url?: string;
    assets?: {
        large_image?: string;
        large_text?: string;
        large_url?: string;
        small_image?: string;
        small_text?: string;
        small_url?: string;
    };
    timestamps?: { start?: number };
};

/** Mirror of the Rust `DiscordRpcStatus` payload. */
export type DiscordRPCStatus = {
    enabled: boolean;
    connected: boolean;
    user: string | null;
    error: string | null;
    activity: DiscordActivity | null;
};

/** Mirror of the Rust `DiscordAppInfo` payload. */
export type DiscordAppInfo = {
    name: string;
    /** Asset key (`amverge_logo`, `edit_icon_new`, …) → CDN url. */
    assets: Record<string, string>;
    icon: string | null;
};

const STATUS_EVENT = "discord_rpc_status";

/** How long an announced outcome ("Export finished") outranks the live status. */
const OUTCOME_HOLD_MS = 12_000;

const fileName = (path: string) => path.split(/[/\\]/).pop() || path;

/** Container extensions this app actually imports. */
const MEDIA_EXT =
    /\.(mp4|mkv|mov|avi|webm|m4v|wmv|flv|mpg|mpeg|ts|mts|m2ts|webp|gif|png|jpe?g)$/i;

/**
 * The media's name as a person would say it: no folders, no extension. Matching
 * a known list rather than "a short tail after a dot" keeps "My.Show.S01" whole.
 */
const mediaName = (path: string) => fileName(path).replace(MEDIA_EXT, "");

/** Everything the presence is derived from, gathered in one place. */
type PresenceInput = {
    showFilename: boolean;
    activePage: string;
    settingsOpen: boolean;
    menuOpen: boolean;
    activeOperation: "import" | "export" | null;
    progress: number;
    batchDone: number;
    batchTotal: number;
    batchCurrentFile: string | null;
    importedVideoPath: string | null;
    episodeName: string | null;
    clipCount: number;
    selectedCount: number;
};

/**
 * The presence, computed from what the app is actually doing.
 *
 * Derived rather than pushed: the old code announced a status at nine moments
 * scattered through the import/export pipeline and then let it rot, so the card
 * kept saying "Detecting" long after detection ended and never named the file
 * being worked on.
 */
function derivePresence(input: PresenceInput): RPCActivity {
    const {
        showFilename,
        activePage,
        settingsOpen,
        menuOpen,
        activeOperation,
        progress,
        batchDone,
        batchTotal,
        batchCurrentFile,
        importedVideoPath,
        episodeName,
        clipCount,
        selectedCount,
    } = input;

    const percent = Math.min(100, Math.max(0, Math.round(progress)));

    // Work in flight outranks everything: it is what the user is doing.
    if (activeOperation === "import") {
        // The file being imported, NOT the episode still open in the panel —
        // during a single import that one names the previous video.
        const source = batchCurrentFile || importedVideoPath;
        const target = source ? mediaName(source) : null;
        const details = showFilename && target ? `Detecting: ${target}` : "Detecting scenes";
        const state =
            batchTotal > 1
                ? `File ${Math.min(batchDone + 1, batchTotal)} of ${batchTotal} · ${percent}%`
                : `${percent}%`;
        return {
            details,
            state,
            small_image: "loading_icon_new",
            small_text: "Detecting",
        };
    }

    if (activeOperation === "export") {
        const count = selectedCount || clipCount;
        return {
            details: count ? `Exporting ${count} clips` : "Exporting clips",
            state: `${percent}%`,
            small_image: "save_icon_new",
            small_text: "Exporting",
        };
    }

    if (settingsOpen) {
        return {
            details: "Adjusting Settings",
            state: "Preferences",
            small_image: "settings_icon_new",
            small_text: "Settings",
        };
    }

    if (menuOpen) {
        return {
            details: "In Main Menu",
            state: "Selecting Episode",
            small_image: "menu_icon_new",
            small_text: "Menu",
        };
    }

    if (activePage === "scenepacks") {
        return {
            details: "Browsing Scenepacks",
            state: "Library",
            small_image: "menu_icon_new",
            small_text: "Scenepacks",
        };
    }

    if (episodeName) {
        // The name carries it; a clip count underneath said nothing anyone
        // reading the card wanted to know.
        return {
            details: showFilename ? episodeName : "Editing Episode",
            small_image: "edit_icon_new",
            small_text: "Editing",
        };
    }

    return {
        details: "In AMVerge",
        state: "No episode open",
        small_image: "menu_icon_new",
        small_text: "Browsing",
    };
}

/**
 * Drives the Discord Rich Presence. Rust owns the connection, the reconnects and
 * Discord's one-update-per-15s cap, so this hook only says *what* to show.
 */
export default function useDiscordRPC() {
    const enabled = useGeneralSettingsStore((s) => s.discordRPCEnabled);
    const showMiniIcons = useGeneralSettingsStore((s) => s.rpcShowMiniIcons);
    const showElapsed = useGeneralSettingsStore((s) => s.rpcShowElapsed);
    const showLinks = useGeneralSettingsStore((s) => s.rpcShowLinks);
    const showFilename = useGeneralSettingsStore((s) => s.rpcShowFilename);

    const activePage = useUIStateStore((s) => s.activePage);
    const settingsOpen = useUIStateStore((s) => s.settingsOpen);
    const menuOpen = useUIStateStore((s) => s.menuOpen);

    const activeOperation = useAppStateStore((s) => s.activeOperation);
    const progress = useAppStateStore((s) => s.progress);
    const batchDone = useAppStateStore((s) => s.batchDone);
    const batchTotal = useAppStateStore((s) => s.batchTotal);
    const batchCurrentFile = useAppStateStore((s) => s.batchCurrentFile);
    const importedVideoPath = useAppStateStore((s) => s.importedVideoPath);
    const clipCount = useAppStateStore((s) => s.clips.length);
    const selectedCount = useAppStateStore((s) => s.selectedClips.size);

    const openedEpisodeId = useEpisodePanelRuntimeStore((s) => s.openedEpisodeId);
    const episodes = useEpisodePanelRuntimeStore((s) => s.episodes);
    const episodeNamesById = useEpisodePanelMetadataStore((s) => s.episodeNamesById);

    // Same precedence the rest of the app uses to name an episode.
    const episodeName = useMemo(() => {
        if (!openedEpisodeId) return null;
        const episode = episodes.find((e) => e.id === openedEpisodeId);
        if (!episode) return null;
        return (
            episodeNamesById[episode.id] ||
            episode.displayName ||
            (episode.videoPath ? mediaName(episode.videoPath) : null) ||
            `Episode ${episode.id}`
        );
    }, [openedEpisodeId, episodes, episodeNamesById]);

    // Settings read inside callbacks that must not be re-created on every flip.
    const flagsRef = useRef({ showMiniIcons, showElapsed, showLinks });
    flagsRef.current = { showMiniIcons, showElapsed, showLinks };
    // An announced outcome holds the card briefly; without it the derived status
    // would overwrite "Export finished" in the same frame it was announced.
    const holdUntilRef = useRef(0);
    const lastActivityRef = useRef<RPCActivity | null>(null);

    /**
     * Sent even when the presence is off: Rust only connects once enabled, but
     * keeps tracking what *would* be published, for the preview card.
     */
    const publish = useCallback(async (activity: RPCActivity) => {
        lastActivityRef.current = activity;
        const flags = flagsRef.current;
        try {
            await invoke("update_discord_rpc", {
                data: {
                    details: activity.details,
                    state: activity.state,
                    large_image: activity.large_image ?? "amverge_logo",
                    small_image: flags.showMiniIcons ? activity.small_image : undefined,
                    small_text: flags.showMiniIcons ? activity.small_text : undefined,
                    links: flags.showLinks,
                    show_elapsed: flags.showElapsed,
                },
            });
        } catch (err) {
            console.error("Failed to update Discord RPC:", err);
        }
    }, []);

    /**
     * Announce an outcome the state cannot express — an export that finished or
     * failed. It outranks the derived status for a few seconds, then the live
     * one takes back over on its own.
     */
    const updateRPC = useCallback(
        async (data: RPCActivity & { type?: string }) => {
            holdUntilRef.current = Date.now() + OUTCOME_HOLD_MS;
            await publish({
                details: data.details,
                state: data.state,
                large_image: data.large_image,
                small_image: data.small_image,
                small_text: data.small_text,
            });
        },
        [publish]
    );

    // The Rust worker survives a stop, so switching back on reconnects at once.
    useEffect(() => {
        const command = enabled ? "start_discord_rpc" : "stop_discord_rpc";
        invoke(command).catch((err) => console.error(`Failed to run ${command}:`, err));
    }, [enabled]);

    const activity = useMemo(
        () =>
            derivePresence({
                showFilename,
                activePage,
                settingsOpen,
                menuOpen,
                activeOperation,
                progress,
                batchDone,
                batchTotal,
                batchCurrentFile,
                importedVideoPath,
                episodeName,
                clipCount,
                selectedCount,
            }),
        [
            showFilename,
            activePage,
            settingsOpen,
            menuOpen,
            activeOperation,
            progress,
            batchDone,
            batchTotal,
            batchCurrentFile,
            importedVideoPath,
            episodeName,
            clipCount,
            selectedCount,
        ]
    );

    // Publish whenever the derived status changes, or a display toggle does.
    // Rust drops identical payloads, so an over-eager render costs nothing.
    useEffect(() => {
        const wait = holdUntilRef.current - Date.now();
        if (wait <= 0) {
            void publish(activity);
            return;
        }
        // An outcome is on screen; take over the moment its hold expires.
        const id = setTimeout(() => void publish(activity), wait);
        return () => clearTimeout(id);
    }, [activity, publish, showMiniIcons, showElapsed, showLinks]);

    return { updateRPC };
}

/** Live connection state; only listens, never publishes. */
export function useDiscordRPCStatus() {
    const [status, setStatus] = useState<DiscordRPCStatus | null>(null);

    useEffect(() => {
        let alive = true;
        invoke<DiscordRPCStatus>("discord_rpc_status")
            .then((s) => {
                if (alive) setStatus(s);
            })
            .catch(() => {});
        const unlisten = listen<DiscordRPCStatus>(STATUS_EVENT, (event) => {
            if (alive) setStatus(event.payload);
        });
        return () => {
            alive = false;
            void unlisten.then((off) => off());
        };
    }, []);

    return status;
}

/**
 * The app's real name and art from Discord's public endpoints, so the preview
 * shows what friends see. Offline yields nothing and the card falls back to the
 * bundled logo.
 */
export function useDiscordAppInfo() {
    const [info, setInfo] = useState<DiscordAppInfo | null>(null);

    useEffect(() => {
        let alive = true;
        invoke<DiscordAppInfo>("discord_rpc_app_info")
            .then((i) => {
                if (alive) setInfo(i);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, []);

    return info;
}
