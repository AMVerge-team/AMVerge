import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import {
  loadGpuPreference,
  saveGpuPreference,
  wantsCudaWheel,
  type AiEnvStatus,
  type AiPackId,
  type GpuPreference,
} from "../features/aiDeps/packs";

const MAX_LOGS = 200;

type Stage = "confirm" | "installing" | "done" | "error";

/// resolver for the promise `ensurePack` handed out. kept outside the store
/// it is control flow, not renderable state
let pendingResolve: ((installed: boolean) => void) | null = null;

function settle(installed: boolean) {
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve?.(installed);
}

export type AiDepsStore = {
  status: AiEnvStatus | null;
  /// a status refresh is in flight (first load shows nothing rather than a lie)
  loading: boolean;

  open: boolean;
  pack: AiPackId | null;
  stage: Stage;
  percent: number;
  indeterminate: boolean;
  message: string;
  logs: string[];
  error: string | null;

  /// names the operation when it is not "install this pack": the dialog is
  /// reused for GPU decode, where "TransNetV2 installed" describes neither what
  /// is running nor what finished. null falls back to the pack's own wording
  job: { title: string; done: string } | null;

  /// user's override for the CUDA/CPU wheel choice, for when the GPU probe is
  /// wrong. persisted, because it has to survive the next install too
  gpuPreference: GpuPreference;
  setGpuPreference: (preference: GpuPreference) => void;

  refresh: () => Promise<AiEnvStatus | null>;
  /// resolves true when `id` is installed and the caller may proceed. opens the
  /// confirm dialog when it isn't, and resolves false if the user declines
  ensurePack: (id: AiPackId) => Promise<boolean>;
  startInstall: () => Promise<void>;
  /// re-resolve every installed pack against the CUDA index. for an env that
  /// ended up on a CPU torch despite the machine having an NVIDIA GPU
  repairGpu: () => Promise<void>;
  /// turn NVDEC decode on or off. rebuilds the AI env on the other profile,
  /// which is a multi-GB re-download either way, so the UI must say so first
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
    // dev builds run against the CLI checkout's venv; nothing to provision
    if (status && !status.managed) return true;

    // a second request while the dialog is open joins the first one
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
      job: null,
    });

    return new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
    });
  },

  startInstall: async () => {
    const { pack, status, gpuPreference } = get();
    if (!pack) return;

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

    try {
      const next = await invoke<AiEnvStatus>("install_ai_pack", {
        pack: installed[0],
        gpu: true,
        // omitted on purpose: a torch repair must not decide the GPU decode
        // profile, and the backend leaves it as it found it
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
    }
  },

  setGpuDecode: async (enabled) => {
    const status = get().status ?? (await get().refresh());
    const installed = (Object.keys(status?.packs ?? {}) as AiPackId[]).filter(
      (id) => status?.packs?.[id],
    );
    if (installed.length === 0) return;

    // different interpreters, so this is a rebuild rather than an add
    settle(false);
    set({
      open: true,
      pack: installed[0],
      stage: "installing",
      percent: 0,
      indeterminate: true,
      message: enabled
        ? "Rebuilding the AI environment with GPU decode..."
        : "Removing GPU decode...",
      logs: [],
      error: null,
      job: {
        title: enabled ? "Enabling GPU decoding" : "Disabling GPU decoding",
        done: enabled ? "GPU decoding enabled" : "GPU decoding disabled",
      },
    });

    try {
      const next = await invoke<AiEnvStatus>("install_ai_pack", {
        pack: installed[0],
        gpu: true,
        gpuDecode: enabled,
      });
      const ok = next.gpuDecodeInstalled === enabled;
      set({
        status: next,
        stage: ok ? "done" : "error",
        percent: 100,
        indeterminate: false,
        message: ok
          ? enabled
            ? "GPU decode enabled."
            : "GPU decode removed."
          : "The environment did not end up on the requested profile.",
        error: ok ? null : "Nelux is still not in the state that was asked for.",
      });
    } catch (err) {
      set({
        stage: "error",
        indeterminate: false,
        error: String(err),
        message: "Rebuild failed.",
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
