import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

// window size per mode (pinned / free); frameless, so the css size is the window size
const WIN_SIZE_KEY = { pinned: "amverge.pinnedSize", free: "amverge.windowSize" } as const;

/** mirrors `minWidth`/`minHeight` in tauri.conf.json; the OS clamps to these anyway */
const MIN = { w: 920, h: 540 } as const;

/** no size remembered yet: compact when pinned, roomy when free */
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
    // a maximized, fullscreen or snapped window ignores setSize, so drop those first, then re-center
    try { await win.setFullscreen(false); } catch { /* noop */ }
    try { await win.unmaximize(); } catch { /* noop */ }
    try { await win.setSize(new LogicalSize(w, h)); } catch { /* noop */ }
    try { await win.center(); } catch { /* noop */ }
}
