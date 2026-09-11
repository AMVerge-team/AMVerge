// optional AI dependency packs.
//
// the installer ships everything that runs on ffmpeg/opencv. anything that needs
// torch is installed on demand into an app-managed Python env (see
// src-tauri/src/commands/deps.rs). this module is the single source of truth for
// what a pack is called, what it unlocks, and how big the download is; the
// gating UI, the confirm dialog and the Dependencies tab all read it

export type AiPackId = "ml" | "depth" | "interpolation" | "upscale" | "scout";

export type TorchVariant = "cuda" | "cpu";

/** what the NVIDIA probe concluded. "absent" is a claim about the hardware,
 *  "unknown" means the probe could not run - never tell a user they have no GPU
 *  on the strength of "unknown" */
export type GpuProbe = "detected" | "absent" | "unknown";

/** mirrors `AiEnvStatus` in src-tauri/src/commands/deps.rs */
export type AiEnvStatus = {
  envReady: boolean;
  uvAvailable: boolean;
  packs: Record<string, boolean>;
  torchVariant: TorchVariant | null;
  torchVersion: string | null;
  envCliVersion: string | null;
  bundledCliVersion: string | null;
  /** true only when a GPU was positively found. false covers both "none" and
   *  "could not tell", so read `gpuProbe` for anything user-facing */
  gpuAvailable: boolean;
  gpuProbe: GpuProbe;
  /** the GPU is Turing or newer, so it can run the CUDA 13 build NVDEC decode
   *  needs. older cards are excluded by CUDA 13, not by us */
  gpuDecodeSupported: boolean;
  /** nelux is installed, so the env is on the GPU-decode profile */
  gpuDecodeInstalled: boolean;
  /** `major.minor` of the env's interpreter, null when there is no env */
  envPythonVersion: string | null;
  /** set when the environment could not be inspected; pack fields are then
   *  unreliable, but the GPU fields are still good */
  statusError: string | null;
  /** Apple Silicon: torch's MPS backend works without a special wheel, so this
   *  holds even when `gpuAvailable`/`torchVariant` (both NVIDIA-only) don't */
  mpsAvailable: boolean;
  envSizeBytes: number;
  /// false in dev builds, where the CLI checkout's venv is used as-is
  managed: boolean;
};

export type AiPack = {
  id: AiPackId;
  /// what the user knows the feature as
  label: string;
  /// named in the "You don't have ___ installed" prompt
  dependencyName: string;
  description: string;
  /// rough download for the pack's own wheels, torch excluded (MB)
  extraSizeMb: number;
};

export const AI_PACKS: Record<AiPackId, AiPack> = {
  ml: {
    id: "ml",
    label: "AI scene detection",
    dependencyName: "TransNetV2",
    description:
      "Finds scene cuts with AI. The most accurate option, and fast on an NVIDIA GPU.",
    extraSizeMb: 60,
  },
  depth: {
    id: "depth",
    label: "Depth map pass",
    dependencyName: "Depth-Anything-V2",
    description: "Creates a depth map of each exported file.",
    extraSizeMb: 60,
  },
  interpolation: {
    id: "interpolation",
    label: "Interpolation pass",
    dependencyName: "RIFE interpolation",
    description:
      "Smooths motion by adding frames to each exported file.",
    extraSizeMb: 80,
  },
  scout: {
    id: "scout",
    label: "Scene Scout",
    dependencyName: "SigLIP 2",
    description:
      "Search your indexed episodes by describing a scene instead of naming a file.",
    // transformers plus the SigLIP 2 weights, which are downloaded on first use
    extraSizeMb: 900,
  },
  upscale: {
    id: "upscale",
    label: "Upscaling",
    dependencyName: "Spandrel / ONNX Runtime",
    description: "Upscales exported files using AI models.",
    extraSizeMb: 250,
  },
};

/// packs surfaced in the UI today. upscaling has no screen yet, so it is
/// registered but not listed
export const VISIBLE_PACK_IDS: AiPackId[] = ["ml", "depth", "interpolation", "scout"];

const TORCH_SIZE_MB: Record<TorchVariant, number> = {
  cuda: 2700,
  cpu: 250,
};

export function isPackInstalled(status: AiEnvStatus | null, id: AiPackId): boolean {
  return Boolean(status?.packs?.[id]);
}

/// what the user has forced, when they disagree with the probe
export type GpuPreference = "auto" | "cuda" | "cpu";

const GPU_PREFERENCE_KEY = "amverge.gpuPreference";

export function loadGpuPreference(): GpuPreference {
  try {
    const raw = localStorage.getItem(GPU_PREFERENCE_KEY);
    if (raw === "cuda" || raw === "cpu") return raw;
  } catch {
    // private windows and blocked site data both throw here
  }
  return "auto";
}

export function saveGpuPreference(preference: GpuPreference): void {
  try {
    if (preference === "auto") localStorage.removeItem(GPU_PREFERENCE_KEY);
    else localStorage.setItem(GPU_PREFERENCE_KEY, preference);
  } catch {
    // a preference that cannot be stored is not worth failing an install over
  }
}

/// an explicit preference always wins, since the probe can be wrong
export function wantsCudaWheel(
  status: AiEnvStatus | null,
  preference: GpuPreference = "auto",
): boolean {
  if (preference === "cuda") return true;
  if (preference === "cpu") return false;
  return status?.gpuProbe === "detected";
}

/// an env that already has torch keeps it, so later packs never re-download
export function plannedTorchVariant(
  status: AiEnvStatus | null,
  preference: GpuPreference = "auto",
): TorchVariant {
  if (status?.torchVariant) return status.torchVariant;
  return wantsCudaWheel(status, preference) ? "cuda" : "cpu";
}

/// estimated download for installing `id` right now, in MB
export function estimateDownloadMb(
  status: AiEnvStatus | null,
  id: AiPackId,
  preference: GpuPreference = "auto",
): number {
  const variant = plannedTorchVariant(status, preference);
  const torchPresent = Boolean(status?.torchVersion) && status?.torchVariant === variant;
  return AI_PACKS[id].extraSizeMb + (torchPresent ? 0 : TORCH_SIZE_MB[variant]);
}

export function formatSizeMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  return formatSizeMb(bytes / (1024 * 1024));
}
