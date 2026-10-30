import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import type { FlowSource } from "../../../features/sceneScout/types";

/** a playable url for a flow clip: a range gets the tiles' scene cut, a whole file the x264 proxy */
export function useFlowPreviewSrc(source: FlowSource | null): { src: string | null; failed: boolean } {
  const [state, setState] = useState<{ key: string; src: string | null; failed: boolean }>({
    key: "",
    src: null,
    failed: false,
  });

  const key = source ? `${source.path}|${source.startMs ?? ""}|${source.endMs ?? ""}` : "";

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const request =
      source.startMs !== undefined && source.endMs !== undefined
        ? invoke<string>("ensure_scene_range_preview", {
            videoPath: source.path,
            startSec: source.startMs / 1000,
            endSec: source.endMs / 1000,
          })
        : // the app's capped cache, never a preview file dropped beside the user's own video
          invoke<string>("ensure_preview_proxy", { clipPath: source.path, transcodeVideo: true, inCache: true });

    request
      .then((path) => {
        if (!cancelled) setState({ key, src: convertFileSrc(path), failed: false });
      })
      .catch((err) => {
        console.warn("flow preview failed", err);
        if (!cancelled) setState({ key, src: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
    // the key captures everything in source that matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // a result from an older source never shows under a newer one
  return state.key === key ? { src: state.src, failed: state.failed } : { src: null, failed: false };
}
