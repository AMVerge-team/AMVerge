import { create } from "zustand";

/** WebP generation progress for the bg bar, counted per burst; its own store so ticks only re-render the bar */
export type WebpLoadingStore = {
  total: number;
  done: number;
  /** the card is hidden: true while generation is paused */
  dismissed: boolean;
  /** the episode whose WebP generation was paused by closing the card; no new encodes start while set */
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
