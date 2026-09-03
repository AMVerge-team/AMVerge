import { create } from "zustand";

/**
 * tracks WebP scene-preview generation progress for the background progress bar.
 * updated by the viewport-aware WebP queue; consumed by App's BgProgressBar
 *
 * `total`/`done` are cumulative for the current loading burst: each newly
 * demanded preview that needs backend work bumps `total`, each finished one
 * bumps `done`. when the queue fully drains (or the episode switches) both reset
 * to 0 so the bar hides and the next burst starts a fresh count
 *
 * kept in its own store so these frequent counter updates only re-render the
 * progress bar, never the clips grid (which slices `scenePreviewStore`).
 */
export type WebpLoadingStore = {
  total: number;
  done: number;
  /**
   * the user closed the background-tasks card. generation continues (results
   * are cached either way), but the card stays hidden until the queue is reset
   * otherwise the next progress update would pop it straight back open.
   */
  dismissed: boolean;
  setProgress: (total: number, done: number) => void;
  dismiss: () => void;
  reset: () => void;
};

export const useWebpLoadingStore = create<WebpLoadingStore>((set) => ({
  total: 0,
  done: 0,
  dismissed: false,
  setProgress: (total, done) =>
    set((s) => (s.total === total && s.done === done ? s : { total, done })),
  dismiss: () => set((s) => (s.dismissed ? s : { dismissed: true })),
  // called when the queue resets (episode switch / new import), which re-arms
  // the card for the next episode
  reset: () =>
    set((s) =>
      s.total === 0 && s.done === 0 && !s.dismissed
        ? s
        : { total: 0, done: 0, dismissed: false },
    ),
}));
