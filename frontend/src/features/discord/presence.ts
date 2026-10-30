// what the presence should say, as a pure function so the rules live in one place
import type { RPCActivity } from "./types";

const fileName = (path: string) => path.split(/[/\\]/).pop() || path;

/** container extensions this app actually imports */
const MEDIA_EXT =
    /\.(mp4|mkv|mov|avi|webm|m4v|wmv|flv|mpg|mpeg|ts|mts|m2ts|webp|gif|png|jpe?g)$/i;

/** the media's spoken name: no folders, no known extension ("My.Show.S01" stays whole) */
export const mediaName = (path: string) => fileName(path).replace(MEDIA_EXT, "");

/** everything the presence is derived from, gathered in one place */
export type PresenceInput = {
    showFilename: boolean;
    activePage: string;
    settingsOpen: boolean;
    menuOpen: boolean;
    activeOperation: "import" | "export" | "scout_add" | "scout_open" | "scout_search" | "scout_thumbnails" | null;
    progress: number;
    batchDone: number;
    batchTotal: number;
    batchCurrentFile: string | null;
    importedVideoPath: string | null;
    episodeName: string | null;
    clipCount: number;
    selectedCount: number;
};

/** the presence derived from what the app is doing, so it never goes stale like pushed statuses did */
export function derivePresence(input: PresenceInput): RPCActivity {
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

    // work in flight outranks everything: it is what the user is doing
    if (activeOperation === "import") {
        // the file being imported, not the episode open in the panel
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

    if (activeOperation === "scout_add") {
        const source = batchCurrentFile;
        const target = source ? mediaName(source) : null;
        const details = showFilename && target ? `Indexing: ${target}` : "Indexing scenes";
        const state =
            batchTotal > 1
                ? `Video ${Math.min(batchDone + 1, batchTotal)} of ${batchTotal} · ${percent}%`
                : `${percent}%`;
        return {
            details,
            state,
            small_image: "loading_icon_new",
            small_text: "Indexing",
        };
    }

    if (activeOperation === "scout_open") {
        return {
            details: "Scene Scout",
            state: "Loading database",
            small_image: "loading_icon_new",
            small_text: "Loading",
        };
    }

    if (activeOperation === "scout_search") {
        return {
            details: "Scene Scout",
            state: "Searching scenes",
            small_image: "loading_icon_new",
            small_text: "Searching",
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
        const state = selectedCount
            ? `${selectedCount} of ${clipCount} clips selected`
            : clipCount
              ? `${clipCount} clips`
              : "No clips yet";
        return {
            details: showFilename ? episodeName : "Editing Episode",
            state,
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
