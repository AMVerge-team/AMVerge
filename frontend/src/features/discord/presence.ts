// What the presence should say, given what the app is doing. A pure
// function on purpose: no stores, no effects, so the rules can be read
// and changed in one place.
import type { RPCActivity } from "./types";

const fileName = (path: string) => path.split(/[/\\]/).pop() || path;

/** Container extensions this app actually imports. */
const MEDIA_EXT =
    /\.(mp4|mkv|mov|avi|webm|m4v|wmv|flv|mpg|mpeg|ts|mts|m2ts|webp|gif|png|jpe?g)$/i;

/**
 * The media's name as a person would say it: no folders, no extension. Matching
 * a known list rather than "a short tail after a dot" keeps "My.Show.S01" whole.
 */
export const mediaName = (path: string) => fileName(path).replace(MEDIA_EXT, "");

/** Everything the presence is derived from, gathered in one place. */
export type PresenceInput = {
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
