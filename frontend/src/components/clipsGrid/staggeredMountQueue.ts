/** mounts preview-all video tiles one at a time, so the browser and GPU don't stall */
import { useRef, useCallback, useEffect } from "react";

type StaggerDemand = {
  order: number; // Lower = higher priority (top-left first)
  onReady: () => void; // Called when it's this tile's turn to mount
};


export function useStaggeredMountQueue(delayMs = 50) {
  const demandRef = useRef<Map<string, StaggerDemand>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startScheduledRef = useRef(false);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(() => {
    if (demandRef.current.size === 0) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    let bestKey: string | null = null;
    let bestOrder = Infinity;
    for (const [key, entry] of demandRef.current) {
      if (entry.order < bestOrder) {
        bestOrder = entry.order;
        bestKey = key;
      }
    }
    if (!bestKey) return;

    const entry = demandRef.current.get(bestKey)!;
    demandRef.current.delete(bestKey);
    entry.onReady();
  }, []);

  const startProcessing = useCallback(() => {
    startScheduledRef.current = false;
    if (intervalRef.current !== null) return;
    if (demandRef.current.size === 0) return;

    tick();
    if (demandRef.current.size > 0) {
      intervalRef.current = setInterval(tick, delayMs);
    }
  }, [tick, delayMs]);

  // schedules the start of processing (defers to next macrotask)
  const scheduleStart = useCallback(() => {
    if (startScheduledRef.current || intervalRef.current !== null) return;
    startScheduledRef.current = true;
    startTimeoutRef.current = setTimeout(startProcessing, 0);
  }, [startProcessing]);

  // stops the tick when the grid unmounts, or it runs against a dead queue all session
  useEffect(() => () => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    if (startTimeoutRef.current !== null) clearTimeout(startTimeoutRef.current);
    intervalRef.current = null;
    startTimeoutRef.current = null;
    demandRef.current.clear();
  }, []);

  // tiles call this to register/unregister their demand to mount
  const reportStaggerDemand = useCallback(
    (key: string, demand: StaggerDemand | null) => {
      if (!demand) {
        demandRef.current.delete(key);
        if (demandRef.current.size === 0 && intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      demandRef.current.set(key, demand);
      scheduleStart();
    },
    [scheduleStart]
  );

  return { reportStaggerDemand };
}