import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type { AiEnvStatus, AiPackId } from "../features/aiDeps/packs";

const MAX_LOGS = 200;

type Stage = "confirm" | "installing" | "done" | "error";

/// Resolver for the promise `ensurePack` handed out. Kept outside the store —
/// it is control flow, not renderable state.
let pendingResolve: ((installed: boolean) => void) | null = null;

function settle(installed: boolean) {
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve?.(installed);
}

export type AiDepsStore = {
  status: AiEnvStatus | null;
  /// A status refresh is in flight (first load shows nothing rather than a lie).
  loading: boolean;

  // Install modal
  open: boolean;
  pack: AiPackId | null;
  stage: Stage;
  percent: number;
  indeterminate: boolean;
  message: string;
  logs: string[];
  error: string | null;

  refresh: () => Promise<AiEnvStatus | null>;
  /// Resolves true when `id` is installed and the caller may proceed. Opens the
  /// confirm dialog when it isn't, and resolves false if the user declines.
  ensurePack: (id: AiPackId) => Promise<boolean>;
  startInstall: () => Promise<void>;
  /// Re-resolve every installed pack against the CUDA index. For an env that
  /// ended up on a CPU torch despite the machine having an NVIDIA GPU.
  repairGpu: () => Promise<void>;
  cancel: () => void;
  close: () => void;

  // Driven by the Tauri event listeners in AiInstallModal.
  applyProgress: (percent: number, indeterminate: boolean, message: string) => void;
  pushLog: (line: string) => void;
};

export const useAiDepsStore = create<AiDepsStore>((set, get) => ({
  status: null,
  loading: false,

  open: false,
  pack: null,
  stage: "confirm",
  percent: 0,
  indeterminate: false,
  message: "",
  logs: [],
  error: null,

  refresh: async () => {
    set({ loading: true });
    try {
      const status = await invoke<AiEnvStatus>("ai_env_status");
      set({ status, loading: false });
      return status;
    } catch (err) {
      console.error("[aiDeps] status failed", err);
      set({ loading: false });
      return get().status;
    }
  },

  ensurePack: async (id) => {
    const status = get().status ?? (await get().refresh());
    if (status?.packs?.[id]) return true;
    // Dev builds run against the CLI checkout's venv; nothing to provision.
    if (status && !status.managed) return true;

    // A second request while the dialog is open joins the first one.
    if (get().open && get().pack === id) {
      return new Promise<boolean>((resolve) => {
        const previous = pendingResolve;
        pendingResolve = (installed) => {
          previous?.(installed);
          resolve(installed);
        };
      });
    }

    settle(false);
    set({
      open: true,
      pack: id,
      stage: "confirm",
      percent: 0,
      indeterminate: false,
      message: "",
      logs: [],
      error: null,
    });

    return new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
    });
  },

  startInstall: async () => {
    const { pack, status } = get();
    if (!pack) return;

    // Driven by the hardware, not by whatever variant happens to be installed.
    // Preferring the installed variant made a CPU torch sticky: once anything
    // pulled in a CPU wheel, every later pack kept reinstalling CPU.
    const gpu = Boolean(status?.gpuAvailable);
    set({
      stage: "installing",
      percent: 0,
      indeterminate: true,
      message: "Starting...",
      logs: [],
      error: null,
    });

    try {
      const next = await invoke<AiEnvStatus>("install_ai_pack", { pack, gpu });
      const installed = Boolean(next.packs?.[pack]);
      set({
        status: next,
        stage: installed ? "done" : "error",
        percent: 100,
        indeterminate: false,
        message: installed ? "Installed." : "Install finished but the packages are still missing.",
        error: installed ? null : "The install completed without adding the expected packages.",
      });
      if (installed) settle(true);
    } catch (err) {
      const message = String(err);
      set({
        stage: "error",
        indeterminate: false,
        error: message,
        message: "Install failed.",
      });
      await get().refresh();
    }
  },

  repairGpu: async () => {
    const status = get().status ?? (await get().refresh());
    const installed = (Object.keys(status?.packs ?? {}) as AiPackId[]).filter(
      (id) => status?.packs?.[id],
    );
    if (installed.length === 0 || !status?.gpuAvailable) return;

    // One call is enough: the backend resolves the requested pack together with
    // every pack already installed, so a single run puts the whole environment
    // on the CUDA wheels.
    settle(false);
    set({
      open: true,
      pack: installed[0],
      stage: "installing",
      percent: 0,
      indeterminate: true,
      message: "Reinstalling PyTorch with GPU support...",
      logs: [],
      error: null,
    });

    try {
      const next = await invoke<AiEnvStatus>("install_ai_pack", {
        pack: installed[0],
        gpu: true,
      });
      set({
        status: next,
        stage: next.torchVariant === "cuda" ? "done" : "error",
        percent: 100,
        indeterminate: false,
        message: next.torchVariant === "cuda" ? "GPU support installed." : "Still on the CPU build.",
        error:
          next.torchVariant === "cuda"
            ? null
            : "PyTorch is still the CPU build after reinstalling.",
      });
    } catch (err) {
      set({
        stage: "error",
        indeterminate: false,
        error: String(err),
        message: "Reinstall failed.",
      });
      await get().refresh();
    }
  },

  cancel: () => {
    set({ message: "Canceling...", indeterminate: true });
    invoke("abort_ai_install")
      .catch(() => {})
      .finally(() => {
        void get().refresh();
      });
  },

  close: () => {
    settle(get().stage === "done");
    set({ open: false, pack: null });
  },

  applyProgress: (percent, indeterminate, message) =>
    set((s) => (s.stage === "installing" ? { percent, indeterminate, message } : {})),

  pushLog: (line) =>
    set((s) => {
      const logs = [...s.logs, line];
      return { logs: logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs };
    }),
}));
