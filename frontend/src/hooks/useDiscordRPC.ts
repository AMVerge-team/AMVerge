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

/** how long an announced outcome ("Export finished") outranks the live status */
const OUTCOME_HOLD_MS = 12_000;

/** drives Rich Presence; rust owns the connection, reconnects and rate cap, this only says what to show */
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

    //
    // the app's episode-name precedence, extension stripped (displayName keeps the container)
    const episodeName = useMemo(() => {
        if (!openedEpisodeId) return null;
        const episode = episodes.find((e) => e.id === openedEpisodeId);
        if (!episode) return null;
        const named =
            episodeNamesById[episode.id] ||
            episode.displayName ||
            episode.videoPath ||
            `Episode ${episode.id}`;
        return mediaName(named);
    }, [openedEpisodeId, episodes, episodeNamesById]);

    // Settings read inside callbacks that must not be re-created on every flip
    const flagsRef = useRef({ showMiniIcons, showElapsed, showLinks });
    flagsRef.current = { showMiniIcons, showElapsed, showLinks };
    // an announced outcome holds the card briefly, or the derived status would overwrite it at once
    const holdUntilRef = useRef(0);
    const lastActivityRef = useRef<RPCActivity | null>(null);

    /** sent even while off: rust tracks what it would publish, for the preview card */
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

    /** announces an export finishing or failing, outranking the derived status for a few seconds */
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

    // the Rust worker survives a stop, so switching back on reconnects at once
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

    // publish on any status or toggle change; rust drops identical payloads
    useEffect(() => {
        const wait = holdUntilRef.current - Date.now();
        if (wait <= 0) {
            void publish(activity);
            return;
        }
        // an outcome is on screen; take over the moment its hold expires
        const id = setTimeout(() => void publish(activity), wait);
        return () => clearTimeout(id);
    }, [activity, publish, showMiniIcons, showElapsed, showLinks]);

    return { updateRPC };
}

/** live connection state; only listens, never publishes */
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

/** the app's real name and art from Discord's public endpoints; offline falls back to the bundled logo */
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
