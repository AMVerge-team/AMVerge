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
import { derivePresence, mediaName } from "../features/discord/presence";
import type {
    DiscordAppInfo,
    DiscordRPCStatus,
    RPCActivity,
} from "../features/discord/types";

export type {
    DiscordActivity,
    DiscordAppInfo,
    DiscordRPCStatus,
    RPCActivity,
} from "../features/discord/types";

const STATUS_EVENT = "discord_rpc_status";

/** How long an announced outcome ("Export finished") outranks the live status. */
const OUTCOME_HOLD_MS = 12_000;

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
