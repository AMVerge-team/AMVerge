// The shapes crossing the Tauri bridge for Rich Presence. Mirrors of the
// Rust payloads: change one side and this one has to follow.

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
