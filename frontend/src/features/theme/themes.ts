// Developer theme definitions + application.
//
// A theme is a folder under `<app_data>/themes/` (see src-tauri commands/themes.rs)
// containing a `theme-info.json` plus any number of `.css` files. `vars`/`layout`
// in theme-info.json map a few convenient CSS variables and layout knobs; the
// `.css` files are injected verbatim and give authors full control over the UI.

import { invoke } from "@tauri-apps/api/core";

export type ThemeLayout = {
  sidebarPosition?: "left" | "right";
  navbarStyle?: "full" | "hidden";
  tileAspect?: "square" | "widescreen";
  tileRadius?: string;
  fontFamily?: string;
};

export type Theme = {
  id: string;
  name: string;
  author?: string;
  description?: string;
  vars: Record<string, string>;
  /** Relative paths of the theme's `.css` files (sorted). */
  cssFiles?: string[];
  /** Absolute path to the theme's thumbnail image, if any. */
  thumbnail?: string;
  layout?: ThemeLayout;
  path?: string;
};

/** Defaults for every variable a theme may set. Mirrors variables.css. */
const THEME_CSS_DEFAULTS: Record<string, string> = {
  "--accent": "#22c55e",
  "--accent-rgb": "34 197 94",
  "--bg-base": "#000000",
  "--bg-accent": "#001a00",
  "--surface-0": "rgba(0, 0, 0, 0.22)",
  "--surface-1": "rgba(255, 255, 255, 0.08)",
  "--surface-2": "rgba(255, 255, 255, 0.12)",
  "--panel-bg": "rgba(0, 0, 0, 0.22)",
  "--panel-border": "rgba(255, 255, 255, 0.12)",
  "--text-primary": "#ffffff",
  "--text-secondary": "rgba(255, 255, 255, 0.55)",
  "--text-muted": "rgba(255, 255, 255, 0.3)",
  "--border": "rgba(255, 255, 255, 0.15)",
  "--border-strong": "rgba(255, 255, 255, 0.35)",
  "--button-bg": "rgba(15, 0, 0, 0.1)",
  "--button-border": "#ffffff",
  "--input-bg": "rgba(255, 255, 255, 0.08)",
  "--input-border": "rgba(255, 255, 255, 0.16)",
  "--scrollbar-thumb": "rgb(var(--accent-rgb) / 0.42)",
  "--scrollbar-track": "rgb(255 255 255 / 0.02)",
  "--overlay-bg": "rgba(0, 0, 0, 0.55)",
  "--modal-bg": "rgba(20, 20, 20, 0.92)",
  "--selector-active-bg": "#003a23",
  "--selector-active-fg": "#00f07a",
  "--selector-active-border": "#0b8f56",
  "--selector-active-desc": "rgba(0, 240, 122, 0.82)",
  "--tile-radius": "12px",
  "--font-ui": "'Jersey 10', system-ui, sans-serif",
  "--radius": "8px",
  "--radius-lg": "12px",
};

const LAYOUT_DEFAULTS: Record<string, string> = {
  "--clip-tile-aspect": "1 / 1",
  "--tile-radius": "12px",
  "--font-ui": "'Jersey 10', system-ui, sans-serif",
};

const LAYOUT_CLASSES = ["theme-sidebar-right", "theme-navbar-hidden"] as const;

/** Parse + validate a raw theme JSON value. Returns null when malformed. */
export function normalizeTheme(raw: unknown): Theme | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!id || !name) return null;

  const vars: Record<string, string> = {};
  if (obj.vars && typeof obj.vars === "object") {
    for (const [key, value] of Object.entries(obj.vars as Record<string, unknown>)) {
      if (typeof value === "string") vars[key] = value;
    }
  }

  let layout: ThemeLayout | undefined;
  if (obj.layout && typeof obj.layout === "object") {
    const l = obj.layout as Record<string, unknown>;
    layout = {};
    if (l.sidebarPosition === "left" || l.sidebarPosition === "right") {
      layout.sidebarPosition = l.sidebarPosition;
    }
    if (l.navbarStyle === "full" || l.navbarStyle === "hidden") {
      layout.navbarStyle = l.navbarStyle;
    }
    if (l.tileAspect === "square" || l.tileAspect === "widescreen") {
      layout.tileAspect = l.tileAspect;
    }
    if (typeof l.tileRadius === "string") layout.tileRadius = l.tileRadius;
    if (typeof l.fontFamily === "string") layout.fontFamily = l.fontFamily;
  }

  return {
    id,
    name,
    author: typeof obj.author === "string" ? obj.author : undefined,
    description: typeof obj.description === "string" ? obj.description : undefined,
    vars,
    cssFiles: Array.isArray(obj.cssFiles)
      ? (obj.cssFiles as unknown[]).filter((f): f is string => typeof f === "string")
      : undefined,
    thumbnail: typeof obj.thumbnail === "string" ? obj.thumbnail : undefined,
    layout,
    path: typeof obj.path === "string" ? obj.path : undefined,
  };
}

const THEME_STYLE_ID = "amverge-theme-css";

/** Custom properties set by the active theme, cleared before the next apply. */
let activeVarKeys: string[] = [];

/** Apply (or clear, when null) a theme's variables + CSS + layout onto the document. */
export function applyTheme(theme: Theme | null, css?: string): void {
  const root = document.documentElement;
  const body = document.body;

  // Remove any previously injected stylesheet.
  const existing = document.getElementById(THEME_STYLE_ID);
  if (existing) existing.remove();

  // Clear custom properties the previous theme set (arbitrary, not just defaults).
  for (const key of activeVarKeys) root.style.removeProperty(key);
  activeVarKeys = [];

  // Reset the known themeable variables to their defaults.
  for (const [key, value] of Object.entries(THEME_CSS_DEFAULTS)) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(LAYOUT_DEFAULTS)) {
    root.style.setProperty(key, value);
  }
  for (const cls of LAYOUT_CLASSES) {
    body.classList.remove(cls);
  }

  if (!theme) return;

  // Apply the theme's variables (any `--` key, unlimited set).
  for (const [key, value] of Object.entries(theme.vars)) {
    if (key.startsWith("--")) {
      root.style.setProperty(key, value);
      activeVarKeys.push(key);
    }
  }

  // Inject the theme's CSS files (concatenated) verbatim — full override power.
  if (css) {
    const style = document.createElement("style");
    style.id = THEME_STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  const layout = theme.layout;
  if (layout) {
    if (layout.sidebarPosition === "right") body.classList.add("theme-sidebar-right");
    if (layout.navbarStyle === "hidden") body.classList.add("theme-navbar-hidden");
    if (layout.tileAspect === "widescreen") root.style.setProperty("--clip-tile-aspect", "16 / 9");
    if (layout.tileAspect === "square") root.style.setProperty("--clip-tile-aspect", "1 / 1");
    if (layout.tileRadius) root.style.setProperty("--tile-radius", layout.tileRadius);
    if (layout.fontFamily) root.style.setProperty("--font-ui", layout.fontFamily);
  }
}

export async function listThemes(): Promise<Theme[]> {
  const raw = await invoke<unknown[]>("list_themes");
  return raw
    .map(normalizeTheme)
    .filter((t): t is Theme => t !== null);
}

export async function loadThemeCss(path: string): Promise<string> {
  return invoke<string>("load_theme_css", { path });
}

export async function deleteTheme(path: string): Promise<void> {
  await invoke("delete_theme", { path });
}

export async function openThemesFolder(): Promise<void> {
  await invoke("open_themes_folder");
}
