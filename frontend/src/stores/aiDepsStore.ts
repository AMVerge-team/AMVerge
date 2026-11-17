import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import {
  AI_PACKS,
  VISIBLE_PACK_IDS,
  isPackInstalled,
  loadGpuPreference,
  saveGpuPreference,
  wantsCudaWheel,
  type AiEnvStatus,
  type AiInstallTarget,
  type AiPackId,
  type GpuPreference,
} from "../features/aiDeps/packs";

const MAX_LOGS = 200;

type Stage = "confirm" | "installing" | "done" | "error";

/// resolver for the promise `ensurePack` handed out; control flow, not state
let pendingResolve: ((installed: boolean) => void) | null = null;
let conflictResolve: ((installed: boolean) => void) | null = null;
let activeInstallPromise: Promise<void> | null = null;
let canceledMinimized = false;

function settle(installed: boolean) {
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve?.(installed);
}

function settleConflict(installed: boolean) {
  const resolve = conflictResolve;
  conflictResolve = null;
  resolve?.(installed);
}

function targetLabel(target: AiInstallTarget | null): string {
  if (!target) return "AI dependency";
  return target === "all" ? "All AI features" : AI_PACKS[target].label;
}

function isTargetSatisfied(status: AiEnvStatus | null, target: AiInstallTarget): boolean {
  if (!status) return false;
  if (target === "all") return VISIBLE_PACK_IDS.every((id) => isPackInstalled(status, id));
  return Boolean(status.packs?.[target]);
}

export type InstallConflict = {
  requestedPack: AiInstallTarget;
  activeLabel: string;
  requestedLabel: string;
};

export type AiDepsStore = {
  status: AiEnvStatus | null;
  /// a status refresh is in flight (first load shows nothing rather than a lie)
  loading: boolean;

  open: boolean;
  pack: AiInstallTarget | null;
  stage: Stage;
  percent: number;
  indeterminate: boolean;
  message: string;
  logs: string[];
  error: string | null;

  /// names a non-install job (GPU decode) for the dialog; null uses the pack's wording
  job: { title: string; done: string } | null;

  /// shown when the user asks to install another pack while one is already running
  conflict: InstallConflict | null;
  conflictCanceling: boolean;

  /// the user's CUDA/CPU override for when the GPU probe is wrong, persisted for later installs
  gpuPreference: GpuPreference;
  setGpuPreference: (preference: GpuPreference) => void;

  refresh: () => Promise<AiEnvStatus | null>;
  /// true when `id` is installed; otherwise opens the confirm dialog, false if declined
  ensurePack: (id: AiInstallTarget) => Promise<boolean>;
  /// true when all visible AI packs are installed; otherwise prompts to install all missing packs
  ensureAllPacks: () => Promise<boolean>;
  resolveConflict: (action: "keep" | "cancel-current") => Promise<void>;
  startInstall: () => Promise<void>;
  /// re-resolves installed packs against the CUDA index, for a CPU torch on an NVIDIA machine
  repairGpu: () => Promise<void>;
  /// adds or removes Nelux (NVDEC decode) in the AI env, which AI Scene Detection then uses
  setGpuDecode: (enabled: boolean) => Promise<void>;
  cancel: () => void;
  close: () => void;
  minimize: () => void;
  openModal: () => void;

  // driven by the Tauri event listeners in AiInstallModal
  applyProgress: (percent: number, indeterminate: boolean, message: string) => void;
  pushLog: (line: string) => void;
};

export const useAiDepsStore = create<AiDepsStore>((set, get) => ({
  status: null,
  loading: false,

  gpuPreference: loadGpuPreference(),
  setGpuPreference: (preference) => {
    saveGpuPreference(preference);
    set({ gpuPreference: preference });
  },

  open: false,
  pack: null,
  stage: "confirm",
  percent: 0,
  indeterminate: false,
  message: "",
  logs: [],
  error: null,
  job: null,
  conflict: null,
  conflictCanceling: false,

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

  ensureAllPacks: () => get().ensurePack("all"),

  ensurePack: async (id) => {
    const status = get().status ?? (await get().refresh());
    if (isTargetSatisfied(status, id)) return true;
    // dev builds run against the CLI checkout's venv; nothing to provision
    if (status && !status.managed) return true;

    // if this same target is already open/installing, surface it and join its completion without resetting anything
    if ((get().open || get().stage === "installing") && get().pack === id) {
      if (!get().open) set({ open: true });
      return new Promise<boolean>((resolve) => {
        const previous = pendingResolve;
        pendingResolve = (installed) => {
          previous?.(installed);
          resolve(installed);
        };
      });
    }

    // another dependency install is actively running: keep its modal/minimized card alive and ask instead of wiping it
    if (get().stage === "installing") {
      settleConflict(false);
      set({
        conflict: {
          requestedPack: id,
          activeLabel: get().job?.title ?? targetLabel(get().pack),
          requestedLabel: targetLabel(id),
        },
        conflictCanceling: false,
      });
      return new Promise<boolean>((resolve) => {
        conflictResolve = resolve;
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
      job: null,
    });

    return new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
    });
  },

  resolveConflict: async (action) => {
    const conflict = get().conflict;
    if (!conflict) return;

    if (action === "keep") {
      set({ conflict: null, conflictCanceling: false });
      settleConflict(false);
      return;
    }

    set({ conflictCanceling: true, message: "Canceling...", indeterminate: true });
    const inFlight = activeInstallPromise;
    await invoke("abort_ai_install").catch(() => {});
    if (inFlight) {
      await inFlight.catch(() => {});
    }
    await get().refresh();

    canceledMinimized = false;
    settle(false);
    const nextResolve = conflictResolve;
    conflictResolve = null;
    pendingResolve = nextResolve;

    set({
      conflict: null,
      conflictCanceling: false,
      open: true,
      pack: conflict.requestedPack,
      stage: "confirm",
      percent: 0,
      indeterminate: false,
      message: "",
      logs: [],
      error: null,
      job: null,
    });
  },

  startInstall: async () => {
    const { pack, status, gpuPreference } = get();
    if (!pack || get().stage === "installing") return;
    canceledMinimized = false;

    // driven by hardware, not the installed variant, which made a CPU torch sticky
    const gpu = wantsCudaWheel(status, gpuPreference);
    set({
      stage: "installing",
      percent: 0,
      indeterminate: true,
      message: "Starting...",
      logs: [],
      error: null,
    });

    let run!: Promise<void>;
    run = (async () => {
      try {
        // gpuDecode left out: GPU decoding is its own setting, and the env keeps whatever it has
        const next = await invoke<AiEnvStatus>("install_ai_pack", { pack, gpu, gpuDecode: undefined });
        const installed = isTargetSatisfied(next, pack);
        if (canceledMinimized) {
          canceledMinimized = false;
          settle(false);
          set({ open: false, pack: null, status: next });
          return;
        }
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
        if (canceledMinimized) {
          canceledMinimized = false;
          settle(false);
          set({ open: false, pack: null });
          await get().refresh();
          return;
        }
        const message = String(err);
        set({
          stage: "error",
          indeterminate: false,
          error: message,
          message: "Install failed.",
        });
        await get().refresh();
      } finally {
        if (activeInstallPromise === run) activeInstallPromise = null;
      }
    })();

    activeInstallPromise = run;
    await run;
  },

  repairGpu: async () => {
    if (get().stage === "installing") {
      set({ open: true });
      return;
    }
    const status = get().status ?? (await get().refresh());
    const installed = (Object.keys(status?.packs ?? {}) as AiPackId[]).filter(
      (id) => status?.packs?.[id],
    );
    // not gated on the GPU probe: an undetected GPU is exactly why this exists
    if (installed.length === 0) return;

    // one call: the backend re-resolves every installed pack onto the CUDA wheels
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
      job: { title: "GPU support", done: "GPU support installed" },
    });

    let run!: Promise<void>;
    run = (async () => {
      try {
        const next = await invoke<AiEnvStatus>("install_ai_pack", {
          pack: installed[0],
          gpu: true,
          // a torch repair leaves the GPU decode profile as it is
          gpuDecode: undefined,
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
      } finally {
        if (activeInstallPromise === run) activeInstallPromise = null;
      }
    })();

    activeInstallPromise = run;
    await run;
  },

  setGpuDecode: async (enabled) => {
    if (get().stage === "installing") {
      set({ open: true });
      return;
    }
    settle(false);
    set({
      open: true,
      pack: "ml",
      stage: "installing",
      percent: 0,
      indeterminate: true,
      message: enabled ? "Installing GPU decoding..." : "Removing GPU decoding...",
      logs: [],
      error: null,
      job: enabled
        ? { title: "GPU decoding", done: "GPU decoding installed" }
        : { title: "Removing GPU decoding", done: "GPU decoding removed" },
    });

    let run!: Promise<void>;
    run = (async () => {
      try {
        // Nelux needs the CUDA build, so turning it on always asks for it
        const next = await invoke<AiEnvStatus>("install_ai_pack", { pack: "ml", gpu: true, gpuDecode: enabled });
        const ok = next.gpuDecodeInstalled === enabled;
        set({
          status: next,
          stage: ok ? "done" : "error",
          percent: 100,
          indeterminate: false,
          message: ok ? (enabled ? "GPU decoding installed." : "GPU decoding removed.") : "Nothing changed.",
          error: ok ? null : enabled ? "Nelux is still missing after the install." : "Nelux is still installed.",
        });
      } catch (err) {
        set({
          stage: "error",
          indeterminate: false,
          error: String(err),
          message: enabled ? "Install failed." : "Removal failed.",
        });
        await get().refresh();
      } finally {
        if (activeInstallPromise === run) activeInstallPromise = null;
      }
    })();

    activeInstallPromise = run;
    await run;
  },

  cancel: () => {
    const wasMinimized = !get().open;
    if (wasMinimized) canceledMinimized = true;
    set({ message: "Canceling...", indeterminate: true });
    invoke("abort_ai_install")
      .catch(() => {})
      .finally(() => {
        if (wasMinimized) {
          settle(false);
          set({ open: false, pack: null });
        }
        void get().refresh();
      });
  },

  close: () => {
    settle(get().stage === "done");
    set({ open: false, pack: null });
  },

  minimize: () => {
    set({ open: false });
  },

  openModal: () => {
    set({ open: true });
  },

  applyProgress: (percent, indeterminate, message) =>
    set((s) => (s.stage === "installing" ? { percent, indeterminate, message } : {})),

  pushLog: (line) =>
    set((s) => {
      const logs = [...s.logs, line];
      return { logs: logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs };
    }),
}));
