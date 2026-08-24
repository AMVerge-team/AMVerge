import { create } from "zustand";
import type { ClipItem } from "../types/domain";

/**
 * Clips being cut into a Scenepack right now.
 *
 * Deliberately NOT persisted. A stored Scenepack clip always owns a
 * materialized copy — that invariant is what lets a pack survive its episode
 * being deleted — so a clip only enters `scenepackStore` once the CLI has
 * actually produced its file. Until then it lives here, which is enough to
 * show it in the grid and to keep the panel honest about what is in flight.
 *
 * If the app closes mid-add this state simply goes away, exactly as if the
 * add had been cancelled. Nothing half-true is ever written to disk.
 */
export type PendingScenepackClip = {
  /** Unique per add, so the same clip can be queued twice without colliding. */
  key: string;
  scenepackId: string;
  /** The episode clip being copied — used to draw the placeholder tile. */
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

  // A failed add keeps its placeholder, carrying the reason. Dropping it
  // silently would leave the user believing the clip is in the pack.
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

/** How many clips are still being cut into a given pack. */
export function countPendingForPack(
  pending: PendingScenepackClip[],
  scenepackId: string
): number {
  let n = 0;
  for (const p of pending) if (p.scenepackId === scenepackId && !p.error) n += 1;
  return n;
}
