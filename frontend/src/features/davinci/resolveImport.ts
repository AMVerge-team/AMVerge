import { invoke } from "@tauri-apps/api/core";

export type DavinciDetection = { installed: boolean; path: string | null };

// One probe per app run: the answer is a filesystem lookup that cannot change
// while the app is open, and the export panel would otherwise re-ask on every
// mount.
let detectionPromise: Promise<DavinciDetection> | null = null;

export function detectDavinciResolve(): Promise<DavinciDetection> {
  if (!detectionPromise) {
    detectionPromise = invoke<DavinciDetection>("detect_davinci_resolve").catch(() => ({
      installed: false,
      path: null,
    }));
  }
  return detectionPromise;
}

/**
 * Push files into Resolve: Media Pool, then appended to the current timeline (a
 * new one at the clip's frame rate when no timeline is open). Rejects with
 * Resolve's own diagnostic — free edition, external scripting off, no project.
 */
export function importClipsToDavinci(paths: string[]): Promise<string> {
  return invoke<string>("import_clips_to_davinci", { clipPaths: paths });
}
