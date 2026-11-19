import { useEffect, useMemo } from "react";
import { isGridScrolling, whenGridScrollSettles } from "./gridScroll.ts";

type StaggerDemand = { order: number; onReady: () => void };

const START_INTERVAL_MS = 50;

export function createStaggeredMountQueue() {
  const pending = new Map<string, StaggerDemand>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelScrollWait: (() => void) | undefined;

  function schedule() {
    if (timer !== undefined || cancelScrollWait || pending.size === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (isGridScrolling()) {
        cancelScrollWait = whenGridScrollSettles(() => {
          cancelScrollWait = undefined;
          schedule();
        });
        return;
      }

      let next: [string, StaggerDemand] | undefined;
      for (const entry of pending) {
        if (!next || entry[1].order < next[1].order) next = entry;
      }
      if (!next) return;
      const [key, demand] = next;
      pending.delete(key);
      demand.onReady();
      schedule();
    }, START_INTERVAL_MS);
  }

  function reportStaggerDemand(key: string, demand: StaggerDemand | null) {
    if (demand) pending.set(key, demand);
    else pending.delete(key);
    schedule();
  }

  function reset() {
    clearTimeout(timer);
    timer = undefined;
    cancelScrollWait?.();
    cancelScrollWait = undefined;
    pending.clear();
  }

  return { reportStaggerDemand, reset };
}

export function useStaggeredMountQueue() {
  const queue = useMemo(createStaggeredMountQueue, []);
  useEffect(() => queue.reset, [queue]);
  return queue;
}
