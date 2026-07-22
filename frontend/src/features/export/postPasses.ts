// Post-export passes: extra CLI steps run on each exported file after export
// completes. Global (not per-profile) config lives in general settings.

export type DepthEncoder = "vits" | "vitb" | "vitl";
export type DepthColormap =
  | "inferno"
  | "viridis"
  | "plasma"
  | "magma"
  | "turbo"
  | "jet";

export type DepthPassConfig = {
  enabled: boolean;
  encoder: DepthEncoder;
  colormap: DepthColormap;
  grayscale: boolean;
};

export type DeadframesPassConfig = {
  enabled: boolean;
  auto: boolean;
  keepTalking: boolean;
  keepCamera: boolean;
  safe: boolean;
  cadence: number;
};

export type InterpolationPassConfig = {
  enabled: boolean;
  model: string;
  factor: number;
};

export type PostExportPasses = {
  depth: DepthPassConfig;
  deadframes: DeadframesPassConfig;
  interpolation: InterpolationPassConfig;
};

export type PostExportPassKind = keyof PostExportPasses;

export const DEFAULT_POST_EXPORT_PASSES: PostExportPasses = {
  depth: { enabled: false, encoder: "vitl", colormap: "inferno", grayscale: false },
  deadframes: {
    enabled: false,
    auto: false,
    keepTalking: false,
    keepCamera: false,
    safe: false,
    cadence: 3,
  },
  interpolation: { enabled: false, model: "rife4.25", factor: 4 },
};

export const DEPTH_ENCODER_OPTIONS: { value: DepthEncoder; label: string }[] = [
  { value: "vits", label: "Depth Anything V2 - Small (fastest)" },
  { value: "vitb", label: "Depth Anything V2 - Base" },
  { value: "vitl", label: "Depth Anything V2 - Large (best)" },
];

export const DEPTH_COLORMAP_OPTIONS: { value: DepthColormap; label: string }[] = [
  { value: "inferno", label: "Inferno" },
  { value: "viridis", label: "Viridis" },
  { value: "plasma", label: "Plasma" },
  { value: "magma", label: "Magma" },
  { value: "turbo", label: "Turbo" },
  { value: "jet", label: "Jet" },
];

export const INTERPOLATION_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "rife4.25", label: "RIFE 4.25" },
  { value: "rife4.17", label: "RIFE 4.17" },
  { value: "rife4.15", label: "RIFE 4.15" },
  { value: "rife4.6", label: "RIFE 4.6" },
];

export const INTERPOLATION_FACTOR_OPTIONS: { value: number; label: string }[] = [
  { value: 2, label: "2x" },
  { value: 3, label: "3x" },
  { value: 4, label: "4x" },
  { value: 6, label: "6x" },
  { value: 8, label: "8x" },
];

// Filename suffix each pass appends to the exported stem.
export const PASS_SUFFIX: Record<PostExportPassKind, string> = {
  depth: "_depth",
  deadframes: "_deadframes",
  interpolation: "_interpolated",
};

export const PASS_LABEL: Record<PostExportPassKind, string> = {
  depth: "Depth map",
  deadframes: "Dead frames",
  interpolation: "Interpolation",
};

export function depthArgs(c: DepthPassConfig): string[] {
  // Always depth-only output (no side-by-side comparison).
  const args = ["--encoder", c.encoder, "--colormap", c.colormap, "--pred-only"];
  if (c.grayscale) args.push("--grayscale");
  return args;
}

export function deadframesArgs(c: DeadframesPassConfig): string[] {
  const args = ["--cadence", String(c.cadence)];
  if (c.auto) args.push("--auto");
  if (c.keepTalking) args.push("--keep-talking");
  if (c.keepCamera) args.push("--keep-camera");
  if (c.safe) args.push("--safe");
  return args;
}

export function interpolationArgs(c: InterpolationPassConfig): string[] {
  return ["--model", c.model, "--factor", String(c.factor)];
}

export function anyPassEnabled(passes: PostExportPasses): boolean {
  return passes.depth.enabled || passes.deadframes.enabled || passes.interpolation.enabled;
}

// Deep-merge persisted (possibly partial/old) config over the defaults so a
// missing or corrupt sub-field never breaks the settings UI or orchestration.
export function normalizePostExportPasses(raw: unknown): PostExportPasses {
  const r = (raw ?? {}) as Partial<PostExportPasses>;
  return {
    depth: { ...DEFAULT_POST_EXPORT_PASSES.depth, ...(r.depth ?? {}) },
    deadframes: { ...DEFAULT_POST_EXPORT_PASSES.deadframes, ...(r.deadframes ?? {}) },
    interpolation: { ...DEFAULT_POST_EXPORT_PASSES.interpolation, ...(r.interpolation ?? {}) },
  };
}
