import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

/**
 * Per-mode window size memory (pinned / free).
 *
 * Pinning is meant to shrink AMVerge into a companion window that sits over
 * another app; unpinning restores the full-size layout. Each mode keeps its own
 * last size so a manual resize is not lost on the next toggle.
 *
 * The window is `decorations: false`, so the document's CSS size IS the logical
 * window size — reading it needs no round trip to the shell.
 */
const WIN_SIZE_KEY = { pinned: "amverge.pinnedSize", free: "amverge.windowSize" } as const;

/** Mirrors `minWidth`/`minHeight` in tauri.conf.json — the OS clamps to these anyway. */
const MIN = { w: 920, h: 540 } as const;

/** No size remembered yet: compact when pinned, roomy when free. */
const WIN_SIZE_DEFAULT = { pinned: { w: 920, h: 620 }, free: { w: 1280, h: 820 } } as const;

export type WinMode = keyof typeof WIN_SIZE_KEY;

export function readWinSize(mode: WinMode): { w: number; h: number } {
    try {
        const v = JSON.parse(localStorage.getItem(WIN_SIZE_KEY[mode]) || "");
        if (v && typeof v.w === "number" && typeof v.h === "number" && v.w > 0 && v.h > 0) {
            return { w: Math.max(MIN.w, v.w), h: Math.max(MIN.h, v.h) };
        }
    } catch {
        /* fall through to the default below */
    }
    return WIN_SIZE_DEFAULT[mode];
}

export function rememberWinSize(mode: WinMode): void {
    const w = Math.round(window.innerWidth);
    const h = Math.round(window.innerHeight);
    if (w < 1 || h < 1) return;
    try {
        localStorage.setItem(WIN_SIZE_KEY[mode], JSON.stringify({ w, h }));
    } catch {
        /* private mode / quota: the toggle still works, only the memory is lost */
    }
}

export async function applyWindowSize(w: number, h: number): Promise<void> {
    const win = getCurrentWindow();
    // A maximized/fullscreen/snapped window IGNORES setSize. Drop those states
    // UNCONDITIONALLY first (isMaximized misses the snapped state on a frameless
    // window), then re-center so the result is visible.
    try { await win.setFullscreen(false); } catch { /* noop */ }
    try { await win.unmaximize(); } catch { /* noop */ }
    try { await win.setSize(new LogicalSize(w, h)); } catch { /* noop */ }
    try { await win.center(); } catch { /* noop */ }
}
