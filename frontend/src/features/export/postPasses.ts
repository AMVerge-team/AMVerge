// post-export passes: extra cli steps on each exported file; global config in general settings

import { t } from "../../i18n";

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
  | "fallin_strong";
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

// labels are getters so they translate at read time; the constants stay importable everywhere
function lazyOption<T, E extends object = object>(value: T, key: string, extra?: E): { value: T; label: string } & E {
  return Object.defineProperty({ value, ...(extra ?? {}) }, "label", {
    enumerable: true,
    get: () => t(key),
  }) as { value: T; label: string } & E;
}

export const DEPTH_ENCODER_OPTIONS: { value: DepthEncoder; label: string }[] = [
  lazyOption<DepthEncoder>("vits", "settingsExport:passes.depthEncoders.vits"),
  lazyOption<DepthEncoder>("vitb", "settingsExport:passes.depthEncoders.vitb"),
  lazyOption<DepthEncoder>("vitl", "settingsExport:passes.depthEncoders.vitl"),
];

export function getDepthEncoderOptions(): { value: DepthEncoder; label: string }[] {
  return DEPTH_ENCODER_OPTIONS.map(({ value, label }) => ({ value, label }));
}

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
  lazyOption<UpscaleModel, { scale: number }>("fallin_soft", "settingsExport:passes.upscaleModels.fallin_soft", { scale: 2 }),
  lazyOption<UpscaleModel, { scale: number }>("adore", "settingsExport:passes.upscaleModels.adore", { scale: 2 }),
  lazyOption<UpscaleModel, { scale: number }>("fallin_strong", "settingsExport:passes.upscaleModels.fallin_strong", { scale: 2 }),
  lazyOption<UpscaleModel, { scale: number }>("shufflecugan", "settingsExport:passes.upscaleModels.shufflecugan", { scale: 2 }),
];

export function getUpscaleModelOptions(): { value: UpscaleModel; label: string; scale: number }[] {
  return UPSCALE_MODEL_OPTIONS.map(({ value, label, scale }) => ({ value, label, scale }));
}

export const UPSCALE_QUALITY_OPTIONS: { value: UpscaleQuality; label: string }[] = [
  lazyOption<UpscaleQuality>("archival", "settingsExport:passes.upscaleQualities.archival"),
  lazyOption<UpscaleQuality>("high", "settingsExport:passes.upscaleQualities.high"),
  lazyOption<UpscaleQuality>("balanced", "settingsExport:passes.upscaleQualities.balanced"),
  lazyOption<UpscaleQuality>("fast", "settingsExport:passes.upscaleQualities.fast"),
];

export function getUpscaleQualityOptions(): { value: UpscaleQuality; label: string }[] {
  return UPSCALE_QUALITY_OPTIONS.map(({ value, label }) => ({ value, label }));
}

// filename suffix each pass appends to the exported stem
export const PASS_SUFFIX: Record<PostExportPassKind, string> = {
  depth: "_depth",
  upscale: "_upscaled",
};

export function getPassLabel(kind: PostExportPassKind): string {
  return t(`settingsExport:passes.labels.${kind}`);
}

export const PASS_LABEL: Record<PostExportPassKind, string> = {
  get depth() {
    return getPassLabel("depth");
  },
  get upscale() {
    return getPassLabel("upscale");
  },
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
