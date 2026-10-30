import { invoke } from "@tauri-apps/api/core";

export type DavinciDetection = { installed: boolean; path: string | null };

// one probe per run: a filesystem lookup that can't change while the app is open
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

/** pushes files into Resolve's Media Pool and timeline; rejects with Resolve's own diagnostic */
export function importClipsToDavinci(paths: string[]): Promise<string> {
  return invoke<string>("import_clips_to_davinci", { clipPaths: paths });
}
