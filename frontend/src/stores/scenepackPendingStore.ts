import { create } from "zustand";
import type { ClipItem } from "../types/domain";

/** clips being cut into a Scenepack; not persisted, since a stored pack clip must always own its file */
export type PendingScenepackClip = {
  /** unique per add, so the same clip can be queued twice without colliding */
  key: string;
  scenepackId: string;
  /** the episode clip being copied, used to draw the placeholder tile */
  source: ClipItem;
  error: string | null;
};

export type ScenepackPendingState = {
  pending: PendingScenepackClip[];
};

export type ScenepackPendingStore = ScenepackPendingState & {
  addPending: (entries: PendingScenepackClip[]) => void;
  resolvePending: (keys: string[]) => void;
  failPending: (keys: string[], error: string) => void;
  dismissFailed: (key: string) => void;
};

export const useScenepackPendingStore = create<ScenepackPendingStore>()((set) => ({
  pending: [],

  addPending: (entries) => set((s) => ({ pending: [...s.pending, ...entries] })),

  resolvePending: (keys) =>
    set((s) => {
      const drop = new Set(keys);
      return { pending: s.pending.filter((p) => !drop.has(p.key)) };
    }),

  // a failed add keeps its placeholder with the reason, so the user isn't misled
  failPending: (keys, error) =>
    set((s) => {
      const hit = new Set(keys);
      return {
        pending: s.pending.map((p) => (hit.has(p.key) ? { ...p, error } : p)),
      };
    }),

  dismissFailed: (key) =>
    set((s) => ({ pending: s.pending.filter((p) => p.key !== key) })),
}));

/** how many clips are still being cut into a given pack */
export function countPendingForPack(
  pending: PendingScenepackClip[],
  scenepackId: string
): number {
  let n = 0;
  for (const p of pending) if (p.scenepackId === scenepackId && !p.error) n += 1;
  return n;
}
