import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClipItem } from "../../types/domain";
import { usePreviewTranscode } from "../preview/usePreviewTranscode";

// roughly the first screen of results; more would hold the encode slot longer than a hover waits
const PREFETCH_COUNT = 8;

/** cuts the top results' range previews one at a time in the background, so hovering them plays at once */
export function useScoutPreviewPrefetch(clips: ClipItem[]): void {
  const { preset } = usePreviewTranscode();
  // same args as the tiles, so a hover reuses the cached cut or joins the one in flight
  const targets = clips
    .filter((c) => c.database && !c.clipPath && c.startSec !== undefined && c.endSec !== undefined && c.endSec > c.startSec)
    .slice(0, PREFETCH_COUNT);
  const key = `${targets.map((c) => c.id).join("|")}|${preset.height}p${preset.crf}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const clip of targets) {
        if (cancelled) return;
        await invoke("ensure_scene_range_preview", {
          videoPath: clip.src,
          startSec: clip.startSec,
          endSec: clip.endSec,
          previewHeight: preset.height,
          previewCrf: preset.crf,
        }).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
