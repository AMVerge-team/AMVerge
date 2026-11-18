import { useEffect, useState } from "react";
import type { LazyClipProps } from "./types.ts";

type Params = {
  clipId: string;
  index: number;
  enabled: boolean;
  reportStaggerDemand: LazyClipProps["reportStaggerDemand"];
};

export function useClipStagger({ clipId, index, enabled, reportStaggerDemand }: Params) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!enabled) return;
    reportStaggerDemand(clipId, { order: index, onReady: () => setReady(true) });
    // A queued tile may scroll away before its turn to start.
    return () => reportStaggerDemand(clipId, null);
  }, [enabled, clipId, index, reportStaggerDemand]);

  return enabled && ready;
}
