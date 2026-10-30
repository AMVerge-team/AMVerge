import { create } from "zustand";

/** animated WebP previews by clip id, filled by the grid's queue and read by tiles and the preview panel */
export type ScenePreviewStore = {
  animatedByClipId: Record<string, string>;
  setAnimated: (clipId: string, path: string) => void;
  /** merges many entries in one commit, so a cache prime renders once */
  setAnimatedMany: (entries: Array<[string, string]>) => void;
  reset: () => void;
};

export const useScenePreviewStore = create<ScenePreviewStore>((set) => ({
  animatedByClipId: {},
  setAnimated: (clipId, path) =>
    set((s) =>
      s.animatedByClipId[clipId] === path
        ? s
        : { animatedByClipId: { ...s.animatedByClipId, [clipId]: path } }
    ),
  setAnimatedMany: (entries) =>
    set((s) => {
      let next = s.animatedByClipId;
      let changed = false;
      for (const [clipId, path] of entries) {
        if (next[clipId] === path) continue;
        if (!changed) {
          next = { ...s.animatedByClipId };
          changed = true;
        }
        next[clipId] = path;
      }
      return changed ? { animatedByClipId: next } : s;
    }),
  reset: () => set({ animatedByClipId: {} }),
}));
