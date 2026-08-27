import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Page } from "../components/sidebar/types";

export type UIState = {
    cols: number;
    gridPreview: boolean;
    sidebarEnabled: boolean;
    sidebarWidthPx: number;
    dividerOffsetPx: number;
    isDragging: boolean;
    activePage: Page;
    settingsTab: string;
    settingsOpen: boolean;
    menuOpen: boolean;
    quickMenuOpen: boolean;
    commandPaletteOpen: boolean;
    previewCollapsed: boolean;
    /** Grid's share of the split, in percent. The import row reads it too, to
     *  keep the preview toggle above the grid's right edge. */
    previewSplitPct: number;
    pinned: boolean;
};

export type UIStateStore = UIState & {
    setCols: (cols: number | ((prev: number) => number)) => void;
    incrementCols: () => void;
    decrementCols: () => void;
    setGridPreview: (
        previewEnabled: boolean | ((prev: boolean) => boolean)
    ) => void;
    setSidebarEnabled: (
        sideBarEnabled: boolean | ((prev: boolean) => boolean)
    ) => void;
    setSidebarWidthPx: (sideBarWidthPx: number) => void;
    setDividerOffsetPx: (
        dividerOffsetPx: number | ((prev: number) => number)
    ) => void;
    setIsDragging: (isDragging: boolean) => void;
    setActivePage: (activePage: Page | ((prev: Page) => Page)) => void;
    setSettingsTab: (tab: string) => void;
    openSettings: (tab?: string) => void;
    closeSettings: () => void;
    openMenu: () => void;
    closeMenu: () => void;
    setQuickMenuOpen: (open: boolean) => void;
    setCommandPaletteOpen: (open: boolean) => void;
    setPreviewCollapsed: (collapsed: boolean) => void;
    setPreviewSplitPct: (pct: number) => void;
    togglePinned: () => void;
};

/** True while a full-screen modal covers the app, so previews can stand down. */
export const selectOverlayOpen = (state: UIState) =>
    state.settingsOpen || state.menuOpen;

export const DEFAULT_UI_STATE: UIState = {
    cols: 6,
    gridPreview: false,
    sidebarEnabled: true,
    sidebarWidthPx: 280,
    dividerOffsetPx: 0,
    isDragging: false,
    activePage: "home",
    settingsTab: "general",
    settingsOpen: false,
    menuOpen: false,
    quickMenuOpen: false,
    commandPaletteOpen: false,
    previewCollapsed: false,
    previewSplitPct: 65,
    pinned: false,
};

export const useUIStateStore = create<UIStateStore>()(
    persist(
        (set) => ({
            ...DEFAULT_UI_STATE,

            setCols: (cols) =>
                set((state) => ({
                    cols: typeof cols === "function" ? cols(state.cols) : cols,
                })),

            incrementCols: () =>
                set((state) => ({ cols: Math.min(12, state.cols + 1) })),

            decrementCols: () =>
                set((state) => ({ cols: Math.max(1, state.cols - 1) })),

            setGridPreview: (previewEnabled) =>
                set((state) => ({
                    gridPreview:
                        typeof previewEnabled === "function"
                            ? previewEnabled(state.gridPreview)
                            : previewEnabled,
                })),
            setSidebarEnabled: (sidebarEnabled) =>
                set((state) => ({
                    sidebarEnabled:
                        typeof sidebarEnabled === "function"
                            ? sidebarEnabled(state.sidebarEnabled)
                            : sidebarEnabled,
                })),
            setSidebarWidthPx: (sidebarWidthPx) => set({ sidebarWidthPx }),
            setDividerOffsetPx: (dividerOffsetPx) =>
                set((state) => ({
                    dividerOffsetPx:
                        typeof dividerOffsetPx === "function"
                            ? dividerOffsetPx(state.dividerOffsetPx)
                            : dividerOffsetPx,
                })),
            setIsDragging: (isDragging) => set({ isDragging }),
            setActivePage: (activePage) =>
                set((state) => ({
                    activePage: typeof activePage === "function" ? activePage(state.activePage) : activePage,
                })),
            setSettingsTab: (settingsTab) => set({ settingsTab }),
            openSettings: (tab) =>
                set(tab
                    ? { settingsOpen: true, settingsTab: tab, quickMenuOpen: false, commandPaletteOpen: false }
                    : { settingsOpen: true, quickMenuOpen: false, commandPaletteOpen: false }),
            closeSettings: () => set({ settingsOpen: false }),
            openMenu: () => set({ menuOpen: true, quickMenuOpen: false, commandPaletteOpen: false }),
            closeMenu: () => set({ menuOpen: false }),
            setQuickMenuOpen: (quickMenuOpen) => set({ quickMenuOpen }),
            setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
            setPreviewCollapsed: (previewCollapsed) => set({ previewCollapsed }),
            setPreviewSplitPct: (previewSplitPct) => set({ previewSplitPct }),
            togglePinned: () => set((state) => ({ pinned: !state.pinned })),
        }),
        {
            name: "amverge.ui.v1",
            partialize: (state) => ({
                // only these states are tracked in localStorage
                // (gridPreview intentionally not persisted: Preview All always
                // starts disabled on app launch)
                sidebarWidthPx: state.sidebarWidthPx,
                cols: state.cols,
                sidebarEnabled: state.sidebarEnabled,
                previewCollapsed: state.previewCollapsed,
                previewSplitPct: state.previewSplitPct,
                // always-on-top outlives a restart; the Tauri window state does not,
                // so Navbar re-applies it on mount
                pinned: state.pinned,
            }),
        }
    )
);