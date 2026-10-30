import { create } from "zustand";

/** the one open context menu app-wide: each menu claims the slot and closes when another takes it */
export type ContextMenuId =
  | "episode-panel-item"
  | "episode-panel-empty"
  | "scenepack-panel-item"
  | "scenepack-panel-empty"
  | "clip-scenepack-picker"
  | "scenepack-clip"
  | "scene-scout-database";

type ContextMenuStore = {
  activeMenu: ContextMenuId | null;
  /** claims the slot, which closes whichever menu held it */
  openContextMenu: (id: ContextMenuId) => void;
  /** releases the slot, but only if this menu still holds it */
  closeContextMenu: (id: ContextMenuId) => void;
};

export const useContextMenuStore = create<ContextMenuStore>()((set, get) => ({
  activeMenu: null,
  openContextMenu: (id) => set({ activeMenu: id }),
  closeContextMenu: (id) => {
    // a menu closing after another claimed the slot must not clear the newcomer
    if (get().activeMenu === id) set({ activeMenu: null });
  },
}));
