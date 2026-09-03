import { create } from "zustand";

const MAX_LOGS = 200;

// UI state for the post-export passes modal. the runner
// (features/export/runPostExportPasses) drives it; the modal reflects it and
// signals stop via `stopRequested`
export type PassRunStore = {
  active: boolean;
  minimized: boolean;
  label: string;
  jobDone: number;
  jobTotal: number;
  percent: number;
  message: string;
  previewSrc: string | null;
  logs: string[];
  finished: boolean;
  stopRequested: boolean;
  errors: string[];

  begin: (jobTotal: number) => void;
  startJob: (label: string) => void;
  setProgress: (percent: number, message: string) => void;
  setPreview: (src: string) => void;
  pushLog: (line: string) => void;
  addError: (label: string) => void;
  completeJob: () => void;
  finish: () => void;
  requestStop: () => void;
  setMinimized: (value: boolean) => void;
  close: () => void;
};

export const usePassRunStore = create<PassRunStore>((set) => ({
  active: false,
  minimized: false,
  label: "",
  jobDone: 0,
  jobTotal: 0,
  percent: 0,
  message: "",
  previewSrc: null,
  logs: [],
  finished: false,
  stopRequested: false,
  errors: [],

  begin: (jobTotal) =>
    set({
      active: true,
      minimized: false,
      finished: false,
      stopRequested: false,
      jobDone: 0,
      jobTotal,
      percent: 0,
      message: "Starting...",
      previewSrc: null,
      logs: [],
      errors: [],
      label: "",
    }),
  startJob: (label) => set({ label, percent: 0, message: "Starting...", previewSrc: null }),
  setProgress: (percent, message) => set({ percent, message }),
  setPreview: (src) => set({ previewSrc: src }),
  pushLog: (line) =>
    set((s) => {
      const logs = [...s.logs, line];
      return { logs: logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs };
    }),
  addError: (label) => set((s) => ({ errors: [...s.errors, label] })),
  completeJob: () => set((s) => ({ jobDone: Math.min(s.jobTotal, s.jobDone + 1) })),
  finish: () => set({ finished: true, percent: 100 }),
  requestStop: () => set({ stopRequested: true, message: "Stopping..." }),
  setMinimized: (value) => set({ minimized: value }),
  close: () => set({ active: false, minimized: false }),
}));
