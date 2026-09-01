import { create } from "zustand";

/**
 * Which context menu is currently open, app-wide.
 *
 * Each menu owns its own position and contents in local state, so nothing
 * stopped two of them being open at once: a right-click inside the grid never
 * reached the panel's outside-click handler, and vice versa. Rather than have
 * every menu know about every other, each claims this slot when it opens and
 * closes itself as soon as the slot names someone else.
 */
export type ContextMenuId =
  | "episode-panel-item"
  | "episode-panel-empty"
  | "scenepack-panel-item"
  | "scenepack-panel-empty"
  | "clip-scenepack-picker"
  | "scenepack-clip";

type ContextMenuStore = {
  activeMenu: ContextMenuId | null;
  /** Claims the slot, which closes whichever menu held it. */
  openContextMenu: (id: ContextMenuId) => void;
  /** Releases the slot, but only if this menu still holds it. */
  closeContextMenu: (id: ContextMenuId) => void;
};

export const useContextMenuStore = create<ContextMenuStore>()((set, get) => ({
  activeMenu: null,
  openContextMenu: (id) => set({ activeMenu: id }),
  closeContextMenu: (id) => {
    // Guarded: a menu closing after another has already claimed the slot must
    // not clear the newcomer.
    if (get().activeMenu === id) set({ activeMenu: null });
  },
}));
