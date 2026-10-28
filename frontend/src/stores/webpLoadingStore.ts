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
  /** the card is hidden: true while generation is paused */
  dismissed: boolean;
  /**
   * the episode whose WebP generation the user paused by closing the card; the
   * queue starts no new encodes while it is set, and the episode row offers resume
   */
  pausedEpisodeId: string | null;
  setProgress: (total: number, done: number) => void;
  pause: (episodeId: string | null) => void;
  resume: () => void;
  reset: () => void;
};

export const useWebpLoadingStore = create<WebpLoadingStore>((set) => ({
  total: 0,
  done: 0,
  dismissed: false,
  pausedEpisodeId: null,
  setProgress: (total, done) =>
    set((s) => (s.total === total && s.done === done ? s : { total, done })),
  pause: (episodeId) => set({ dismissed: true, pausedEpisodeId: episodeId }),
  resume: () => set({ dismissed: false, pausedEpisodeId: null }),
  // called when the queue resets (episode switch / new import): the next episode starts unpaused
  reset: () =>
    set((s) =>
      s.total === 0 && s.done === 0 && !s.dismissed && s.pausedEpisodeId === null
        ? s
        : { total: 0, done: 0, dismissed: false, pausedEpisodeId: null },
    ),
}));
