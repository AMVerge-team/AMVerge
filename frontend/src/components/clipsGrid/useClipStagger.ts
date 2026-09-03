import { useEffect, useRef, useState } from "react";
import { LazyClipProps } from "./types.ts";

type Params = {
  clipId: string;
  index: number;
  gridPreview: boolean;
  isHovered: boolean;
  isVisible: boolean;
  needsHevcProxy: boolean;
  resetKey: unknown;
  reportStaggerDemand: LazyClipProps["reportStaggerDemand"];
};

// preview-all lights tiles up top-left to bottom-right instead of all at once:
// tiles register demand and a central queue calls onReady when it is their turn
export function useClipStagger({
  clipId,
  index,
  gridPreview,
  isHovered,
  isVisible,
  needsHevcProxy,
  resetKey,
  reportStaggerDemand,
}: Params) {
  const [staggerReady, setStaggerReady] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    setStaggerReady(false);
  }, [resetKey]);

  useEffect(() => {
    const clear = () => reportStaggerDemand(clipId, null);

    if (!gridPreview) {
      clear();
      return;
    }

    // hover skips the queue so the hovered tile plays instantly
    if (isHovered) {
      doneRef.current = true;
      setStaggerReady(true);
      clear();
      return;
    }

    if (!isVisible) {
      doneRef.current = false;
      setStaggerReady(false);
      clear();
      return;
    }

    // already mounted and still visible, or serialised by the proxy queue instead
    if (doneRef.current || needsHevcProxy) {
      setStaggerReady(true);
      clear();
      return;
    }

    reportStaggerDemand(clipId, {
      order: index,
      onReady: () => {
        doneRef.current = true;
        setStaggerReady(true);
      },
    });

    return clear;
  }, [gridPreview, isHovered, isVisible, needsHevcProxy, clipId, index, reportStaggerDemand]);

  return staggerReady;
}
