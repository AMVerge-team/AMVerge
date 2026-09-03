import type { ExportProfileIcon } from "../../../features/export/profiles";

export const FEATURED_PROFILE_ICONS_KEY = "amverge.featuredProfileIcons";
export const MAX_INLINE_VISIBLE_ICON_COUNT = 8;
export const MAX_FEATURED_ICONS = 8;

export const INLINE_DEFAULT_ICONS: ExportProfileIcon[] = [
  "video",
  "remux",
  "h264",
  "h265",
  "prores",
];

export const ICON_FILE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"];

export type PersistedFeaturedIcons = {
  builtIn: ExportProfileIcon[];
  custom: string[];
};

// the cache-buster query is display-only, so paths compare on the bare value
export function normalizeIconPath(path: string | null | undefined): string {
  return (path || "").split("?")[0];
}

// a freshly cropped icon reuses its path, so the webview needs a reason to refetch
export function stampIconPath(path: string): string {
  return `${normalizeIconPath(path)}?t=${Date.now()}`;
}

export function getInlineVisibleIconCount(viewportWidth: number): number {
  if (viewportWidth <= 960) return 5;
  if (viewportWidth <= 1160) return 6;
  if (viewportWidth <= 1360) return 7;
  return MAX_INLINE_VISIBLE_ICON_COUNT;
}

export function getCurrentInlineVisibleIconCount(): number {
  if (typeof window === "undefined") return MAX_INLINE_VISIBLE_ICON_COUNT;
  return getInlineVisibleIconCount(window.innerWidth);
}

/**
 * drops icons that no longer exist, removes duplicates, and caps the total at
 * MAX_FEATURED_ICONS with built-ins taking slots first. both the persisted value
 * read at mount and every later save go through this, so a stale localStorage
 * entry can never outlive the icon it points at.
 */
export function selectFeaturedIcons(
  builtIn: ExportProfileIcon[],
  custom: string[],
  availableIcons: Set<ExportProfileIcon>,
  availableCustomPaths: Set<string>
): PersistedFeaturedIcons {
  const builtInSeen = new Set<ExportProfileIcon>();
  const validBuiltIn: ExportProfileIcon[] = [];

  for (const icon of builtIn) {
    if (!availableIcons.has(icon) || builtInSeen.has(icon)) continue;
    builtInSeen.add(icon);
    validBuiltIn.push(icon);
    if (validBuiltIn.length >= MAX_FEATURED_ICONS) break;
  }

  const remainingSlots = Math.max(0, MAX_FEATURED_ICONS - validBuiltIn.length);
  const customSeen = new Set<string>();
  const validCustom: string[] = [];

  for (const rawPath of custom) {
    const path = normalizeIconPath(rawPath);
    if (!path || !availableCustomPaths.has(path) || customSeen.has(path)) continue;
    customSeen.add(path);
    validCustom.push(path);
    if (validCustom.length >= remainingSlots) break;
  }

  return { builtIn: validBuiltIn, custom: validCustom };
}

// older builds stored a bare array of built-in icons
export function readPersistedFeaturedIcons(): PersistedFeaturedIcons {
  try {
    const raw = window.localStorage.getItem(FEATURED_PROFILE_ICONS_KEY);
    if (!raw) return { builtIn: [], custom: [] };

    const parsed = JSON.parse(raw) as PersistedFeaturedIcons | ExportProfileIcon[];
    if (Array.isArray(parsed)) return { builtIn: parsed, custom: [] };
    if (parsed && typeof parsed === "object") {
      return {
        builtIn: Array.isArray(parsed.builtIn) ? parsed.builtIn : [],
        custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      };
    }
  } catch {
    // ignore invalid persisted values
  }
  return { builtIn: [], custom: [] };
}

export function writePersistedFeaturedIcons(value: PersistedFeaturedIcons) {
  try {
    window.localStorage.setItem(FEATURED_PROFILE_ICONS_KEY, JSON.stringify(value));
  } catch {
    // ignore storage failures and keep in-memory state
  }
}
