import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGeneralSettingsStore } from "../stores/settingsStore";
import { useUIStateStore } from "../stores/UIStore";
import { useAppStateStore } from "../stores/appStore";

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
    buttons?: { label: string; url: string }[];
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

const IDLE: RPCActivity = {
    details: "Navigating menus",
    state: "Idle",
    small_image: "menu_icon_new",
    small_text: "Browsing",
};

/**
 * Drives the Discord Rich Presence. Rust owns the connection, the reconnects and
 * Discord's one-update-per-15s cap, so this hook only says *what* to show.
 */
export default function useDiscordRPC() {
    const enabled = useGeneralSettingsStore((s) => s.discordRPCEnabled);
    const showButtons = useGeneralSettingsStore((s) => s.rpcShowButtons);
    const showMiniIcons = useGeneralSettingsStore((s) => s.rpcShowMiniIcons);
    const showElapsed = useGeneralSettingsStore((s) => s.rpcShowElapsed);
    const showLinks = useGeneralSettingsStore((s) => s.rpcShowLinks);

    const activePage = useUIStateStore((s) => s.activePage);
    const settingsOpen = useUIStateStore((s) => s.settingsOpen);
    const menuOpen = useUIStateStore((s) => s.menuOpen);
    const activeOperation = useAppStateStore((s) => s.activeOperation);

    // The last activity a caller asked for, kept so a toggle can replay it.
    const lastActivityRef = useRef<RPCActivity>(IDLE);
    // Settings read inside callbacks that must not be re-created on every flip.
    const flagsRef = useRef({ showButtons, showMiniIcons, showElapsed, showLinks });
    flagsRef.current = { showButtons, showMiniIcons, showElapsed, showLinks };

    /**
     * Sent even when the presence is off: Rust only connects once enabled, but
     * keeps tracking what *would* be published, for the preview card.
     */
    const publish = useCallback(async (activity: RPCActivity) => {
        const flags = flagsRef.current;
        try {
            await invoke("update_discord_rpc", {
                data: {
                    details: activity.details,
                    state: activity.state,
                    large_image: activity.large_image ?? "amverge_logo",
                    small_image: flags.showMiniIcons ? activity.small_image : undefined,
                    small_text: flags.showMiniIcons ? activity.small_text : undefined,
                    buttons: flags.showButtons,
                    links: flags.showLinks,
                    show_elapsed: flags.showElapsed,
                },
            });
        } catch (err) {
            console.error("Failed to update Discord RPC:", err);
        }
    }, []);

    /** Callers pass whatever they like; the user's toggles win. */
    const updateRPC = useCallback(
        async (data: RPCActivity & { type?: string }) => {
            lastActivityRef.current = {
                details: data.details,
                state: data.state,
                large_image: data.large_image,
                small_image: data.small_image,
                small_text: data.small_text,
            };
            await publish(lastActivityRef.current);
        },
        [publish]
    );

    // The Rust worker survives a stop, so switching back on reconnects at once.
    useEffect(() => {
        const command = enabled ? "start_discord_rpc" : "stop_discord_rpc";
        invoke(command)
            .then(() => publish(lastActivityRef.current))
            .catch((err) => console.error(`Failed to run ${command}:`, err));
    }, [enabled, publish]);

    // An import/export in flight speaks for itself, so navigation stays quiet
    // until it finishes.
    const prevOperationRef = useRef(activeOperation);
    useEffect(() => {
        const justFinished = prevOperationRef.current !== null && activeOperation === null;
        prevOperationRef.current = activeOperation;
        if (activeOperation) return;
        // It published its own outcome ("Export Finished!") and restores idle
        // itself; stepping on that would flash the result by for one frame.
        if (justFinished) return;

        let activity: RPCActivity = IDLE;
        if (settingsOpen) {
            activity = {
                details: "Adjusting Settings",
                state: "Preferences",
                small_image: "settings_icon_new",
                small_text: "Settings",
            };
        } else if (menuOpen) {
            activity = {
                details: "In Main Menu",
                state: "Selecting Episode",
                small_image: "menu_icon_new",
                small_text: "Menu",
            };
        } else if (activePage === "scenepacks") {
            activity = {
                details: "Browsing Scenepacks",
                state: "Library",
                small_image: "menu_icon_new",
                small_text: "Scenepacks",
            };
        } else if (activePage === "home") {
            activity = {
                details: "Editing Episode",
                state: "Ready",
                small_image: "edit_icon_new",
                small_text: "Editing",
            };
        }

        lastActivityRef.current = activity;
        void publish(activity);
    }, [activePage, settingsOpen, menuOpen, activeOperation, publish]);

    // A toggle must show now, not at the next page change.
    useEffect(() => {
        void publish(lastActivityRef.current);
    }, [showButtons, showMiniIcons, showElapsed, showLinks, publish]);

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
