// optional AI dependency packs.
//
// the installer ships everything that runs on ffmpeg/opencv. anything that needs
// torch is installed on demand into an app-managed Python env (see
// src-tauri/src/commands/deps.rs). this module is the single source of truth for
// what a pack is called, what it unlocks, and how big the download is; the
// gating UI, the confirm dialog and the Dependencies tab all read it

export type AiPackId = "ml" | "depth" | "interpolation" | "upscale";

export type TorchVariant = "cuda" | "cpu";

/** mirrors `AiEnvStatus` in src-tauri/src/commands/deps.rs */
export type AiEnvStatus = {
  envReady: boolean;
  uvAvailable: boolean;
  packs: Record<string, boolean>;
  torchVariant: TorchVariant | null;
  torchVersion: string | null;
  envCliVersion: string | null;
  bundledCliVersion: string | null;
  gpuAvailable: boolean;
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
export const VISIBLE_PACK_IDS: AiPackId[] = ["ml", "depth", "interpolation"];

const TORCH_SIZE_MB: Record<TorchVariant, number> = {
  cuda: 2700,
  cpu: 250,
};

export function isPackInstalled(status: AiEnvStatus | null, id: AiPackId): boolean {
  return Boolean(status?.packs?.[id]);
}

/// which torch build a fresh install would pull: CUDA when an NVIDIA GPU is
/// present, otherwise the small CPU wheel. an env that already has torch keeps
/// what it has, so later packs never re-download it
export function plannedTorchVariant(status: AiEnvStatus | null): TorchVariant {
  if (status?.torchVariant) return status.torchVariant;
  return status?.gpuAvailable ? "cuda" : "cpu";
}

/// estimated download for installing `id` right now, in MB
export function estimateDownloadMb(status: AiEnvStatus | null, id: AiPackId): number {
  const variant = plannedTorchVariant(status);
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
