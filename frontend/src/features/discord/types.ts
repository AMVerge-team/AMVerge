// the shapes crossing the Tauri bridge for Rich Presence. mirrors of the
// Rust payloads: change one side and this one has to follow

/** what a caller describes: the activity itself, without the display toggles */
export type RPCActivity = {
    details?: string;
    state?: string;
    large_image?: string;
    small_image?: string;
    small_text?: string;
};

/** the activity payload Discord receives, mirrored for the settings preview */
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

/** mirror of the Rust `DiscordRpcStatus` payload */
export type DiscordRPCStatus = {
    enabled: boolean;
    connected: boolean;
    /** display name, what Discord shows first */
    user: string | null;
    /** the @handle you type in Discord's search bar, always lowercase */
    user_handle: string | null;
    error: string | null;
    activity: DiscordActivity | null;
};

/** mirror of the Rust `DiscordAppInfo` payload */
export type DiscordAppInfo = {
    name: string;
    /** asset key (`amverge_logo`, `edit_icon_new`, …) → CDN url */
    assets: Record<string, string>;
    icon: string | null;
};
