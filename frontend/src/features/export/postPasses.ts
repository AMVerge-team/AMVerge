// post-export passes: extra cli steps on each exported file; global config in general settings

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

export type UpscaleModel =
  | "shufflecugan"
  | "adore"
  | "fallin_soft"
  | "fallin_strong"
  | "realesrgan-anime";
export type UpscaleQuality = "archival" | "high" | "balanced" | "fast";

export type UpscalePassConfig = {
  enabled: boolean;
  model: UpscaleModel;
  quality: UpscaleQuality;
};

export type PostExportPasses = {
  depth: DepthPassConfig;
  upscale: UpscalePassConfig;
};

export type PostExportPassKind = keyof PostExportPasses;

export const POST_EXPORT_PASS_KINDS: PostExportPassKind[] = ["depth", "upscale"];

export const DEFAULT_POST_EXPORT_PASSES: PostExportPasses = {
  depth: { enabled: false, encoder: "vitl", colormap: "inferno", grayscale: false },
  upscale: { enabled: false, model: "fallin_soft", quality: "high" },
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

// torch models only (artcnn runs on onnxruntime's cpu build), each at its native scale: anything else is just a resize
export const UPSCALE_MODEL_OPTIONS: { value: UpscaleModel; label: string; scale: number }[] = [
  { value: "fallin_soft", label: "Fallin Soft - 2x, cleanest", scale: 2 },
  { value: "adore", label: "Adore - 2x, high quality", scale: 2 },
  { value: "fallin_strong", label: "Fallin Strong - 2x, sharper", scale: 2 },
  { value: "shufflecugan", label: "ShuffleCUGAN - 2x, general purpose", scale: 2 },
  { value: "realesrgan-anime", label: "Real-ESRGAN Anime - 4x, much slower", scale: 4 },
];

export const UPSCALE_QUALITY_OPTIONS: { value: UpscaleQuality; label: string }[] = [
  { value: "archival", label: "Archival (largest file)" },
  { value: "high", label: "High" },
  { value: "balanced", label: "Balanced" },
  { value: "fast", label: "Fast (smallest file)" },
];

// filename suffix each pass appends to the exported stem
export const PASS_SUFFIX: Record<PostExportPassKind, string> = {
  depth: "_depth",
  upscale: "_upscaled",
};

export const PASS_LABEL: Record<PostExportPassKind, string> = {
  depth: "Depth map",
  upscale: "Upscale",
};

export function depthArgs(c: DepthPassConfig): string[] {
  // always depth-only output (no side-by-side comparison)
  const args = ["--encoder", c.encoder, "--colormap", c.colormap, "--pred-only"];
  if (c.grayscale) args.push("--grayscale");
  return args;
}

export function upscaleArgs(c: UpscalePassConfig): string[] {
  const scale = UPSCALE_MODEL_OPTIONS.find((option) => option.value === c.model)?.scale ?? 2;
  return ["--model", c.model, "--scale", String(scale), "--preset", c.quality];
}

export function anyPassEnabled(passes: PostExportPasses): boolean {
  return POST_EXPORT_PASS_KINDS.some((kind) => passes[kind].enabled);
}

// deep-merges persisted config over defaults so a missing or corrupt field never breaks anything
export function normalizePostExportPasses(raw: unknown): PostExportPasses {
  const r = (raw ?? {}) as Partial<PostExportPasses>;
  const upscale = { ...DEFAULT_POST_EXPORT_PASSES.upscale, ...(r.upscale ?? {}) };
  if (!UPSCALE_MODEL_OPTIONS.some((option) => option.value === upscale.model)) {
    upscale.model = DEFAULT_POST_EXPORT_PASSES.upscale.model;
  }
  return {
    depth: { ...DEFAULT_POST_EXPORT_PASSES.depth, ...(r.depth ?? {}) },
    upscale,
  };
}
