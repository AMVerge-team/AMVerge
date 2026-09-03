/**
 * theme colour presets
 *
 * each accent ships with the background gradient designed to sit under it, so
 * picking an accent preset applies both. the pair is the source of truth for
 * the swatches in both colour pickers.
 */

export type ColorPreset = {
  accent: string;
  gradient: string;
};

export const COLOR_PRESETS: ColorPreset[] = [
  { accent: "#22c55e", gradient: "#001a00" },
  { accent: "#3b82f6", gradient: "#000f1f" },
  { accent: "#ef4444", gradient: "#1a0000" },
  { accent: "#eab308", gradient: "#1a1400" },
  { accent: "#8b5cf6", gradient: "#0f0020" },
  { accent: "#f43f5e", gradient: "#1a0008" },
  { accent: "#06b6d4", gradient: "#001a1f" },
  { accent: "#f97316", gradient: "#1a0d00" },
  { accent: "#ffffff", gradient: "#141414" },
  { accent: "#bebebe", gradient: "#0f0f0f" },
  { accent: "#6366f1", gradient: "#06061f" },
  { accent: "#a855f7", gradient: "#14002b" },
];

export const ACCENT_PRESET_COLORS = COLOR_PRESETS.map((p) => p.accent);
export const GRADIENT_PRESET_COLORS = COLOR_PRESETS.map((p) => p.gradient);

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** the preset an accent belongs to, or null for a custom colour */
export function findAccentPreset(accent: string): ColorPreset | null {
  return COLOR_PRESETS.find((p) => eq(p.accent, accent)) ?? null;
}

/**
 * true while the gradient is one the app chose rather than one the user picked.
 * used to decide whether a new accent may overwrite it.
 */
export function isPresetGradient(gradient: string): boolean {
  return COLOR_PRESETS.some((p) => eq(p.gradient, gradient));
}
