import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import { useAppStateStore } from "../../stores/appStore";

// Tools judges quality by eye, so its copies are far sharper than the grid's 480p previews
const VIEW_HEIGHT = 1080;
const VIEW_CRF = 16;
// containers the webview plays straight from disk
const DIRECT_PLAY = ["mp4", "m4v", "mov", "webm"];

export type PlayableRange = { startSec: number; endSec: number } | null;

/** a url Tools can play for a file or a range inside one: the file itself when the webview plays it, else a sharp copy */
export function useToolsPlayable(path: string | null, range: PlayableRange = null): { src: string | null; failed: boolean } {
  const userHasHEVC = useAppStateStore((s) => s.userHasHEVC);
  const key = path ? `${path}|${range?.startSec ?? ""}|${range?.endSec ?? ""}` : "";
  const [state, setState] = useState<{ key: string; src: string | null; failed: boolean }>({ key: "", src: null, failed: false });

  useEffect(() => {
    if (!path) return;
    let cancelled = false;

    const resolve = async (): Promise<string> => {
      if (range) {
        return invoke<string>("ensure_scene_range_preview", {
          videoPath: path,
          startSec: range.startSec,
          endSec: range.endSec,
          previewHeight: VIEW_HEIGHT,
          previewCrf: VIEW_CRF,
        });
      }
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      if (DIRECT_PLAY.includes(ext)) {
        const codec = await invoke<{ hevc: boolean; browserPlayable: boolean }>("check_video_codec", { videoPath: path })
          .catch(() => ({ hevc: false, browserPlayable: true }));
        if (codec.browserPlayable && (!codec.hevc || userHasHEVC)) return path;
      }
      // the app's capped cache, never a file dropped beside the user's own video
      return invoke<string>("ensure_preview_proxy", {
        clipPath: path,
        transcodeVideo: true,
        previewHeight: VIEW_HEIGHT,
        previewCrf: VIEW_CRF,
        inCache: true,
      });
    };

    resolve()
      .then((playable) => {
        if (!cancelled) setState({ key, src: convertFileSrc(playable), failed: false });
      })
      .catch((err) => {
        console.warn("[tools] preview failed", err);
        if (!cancelled) setState({ key, src: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userHasHEVC]);

  // a result for an older file never shows under a newer one
  return state.key === key ? { src: state.src, failed: state.failed } : { src: null, failed: false };
}
