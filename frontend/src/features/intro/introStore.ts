import { create } from "zustand";

/** runtime only: whether the startup splash has gone, so the grid can hold its launch reveal until then */
export const useIntroStore = create<{ splashDone: boolean }>(() => ({ splashDone: false }));
