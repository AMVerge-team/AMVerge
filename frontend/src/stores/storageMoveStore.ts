import { t } from "../i18n";
import { create } from "zustand";

const MAX_LOGS = 250;

export type StorageMoveStage = "moving" | "done" | "error";

export type StorageMoveStore = {
  open: boolean;
  title: string;
  stage: StorageMoveStage | null;
  percent: number;
  indeterminate: boolean;
  message: string;
  logs: string[];
  error: string | null;

  begin: (title: string) => void;
  finish: (message?: string) => void;
  fail: (error: string) => void;
  minimize: () => void;
  openModal: () => void;
  close: () => void;
  applyProgress: (percent: number, indeterminate: boolean, message: string) => void;
  pushLog: (line: string) => void;
};

export const useStorageMoveStore = create<StorageMoveStore>((set) => ({
  open: false,
  title: "",
  stage: null,
  percent: 0,
  indeterminate: true,
  message: "",
  logs: [],
  error: null,

  begin: (title) =>
    set({
      open: true,
      title,
      stage: "moving",
      percent: 0,
      indeterminate: true,
      message: t("storage:preparing"),
      logs: [],
      error: null,
    }),

  finish: (message = t("storage:complete")) =>
    set({
      stage: "done",
      percent: 100,
      indeterminate: false,
      message,
    }),

  fail: (error) =>
    set({
      open: true,
      stage: "error",
      indeterminate: false,
      message: t("storage:failed"),
      error,
    }),

  minimize: () => set({ open: false }),
  openModal: () => set({ open: true }),
  close: () =>
    set((s) => (s.stage === "moving" ? { open: false } : { open: false, stage: null })),

  applyProgress: (percent, indeterminate, message) =>
    set((s) => (s.stage === "moving" ? { percent, indeterminate, message } : {})),

  pushLog: (line) =>
    set((s) => {
      const logs = [...s.logs, line];
      return { logs: logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs };
    }),
}));
