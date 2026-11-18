import { isGridScrolling, whenGridScrollSettles } from "./gridScroll.ts";

type PreviewDemand = {
  order: number;
  hovered: boolean;
  onReady: (path: string) => void;
  onError: (error: unknown) => void;
};

type PreviewJob = {
  key: string;
  request: (cacheOnly: boolean) => Promise<string>;
  needsEncode: boolean;
  demands: Set<PreviewDemand>;
};

// One grid job across all pages. The focused player can use the other backend slot.
const jobs = new Map<string, PreviewJob>();
let activeJob: PreviewJob | undefined;
let scheduled = false;
let cancelScrollWait: (() => void) | undefined;

function schedule() {
  if (activeJob || scheduled || jobs.size === 0) return;
  scheduled = true;
  // Coalesce React effect cleanup and registration before picking the next job.
  queueMicrotask(() => {
    scheduled = false;
    void runNext();
  });
}

async function runNext() {
  const scrolling = isGridScrolling();
  let next: PreviewJob | undefined;
  let best: PreviewDemand | undefined;
  for (const job of jobs.values()) {
    if (!job.needsEncode) continue;
    for (const demand of job.demands) {
      if (scrolling && !demand.hovered) continue;
      if (!best || (demand.hovered && !best.hovered) ||
        (demand.hovered === best.hovered && demand.order < best.order)) {
        next = job;
        best = demand;
      }
    }
  }

  if (!next) {
    if (scrolling && jobs.size > 0 && !cancelScrollWait) {
      cancelScrollWait = whenGridScrollSettles(() => {
        cancelScrollWait = undefined;
        schedule();
      });
    }
    return;
  }

  activeJob = next;
  try {
    const path = await next.request(false);
    for (const demand of next.demands) demand.onReady(path);
  } catch (error) {
    for (const demand of next.demands) demand.onError(error);
  } finally {
    jobs.delete(next.key);
    activeJob = undefined;
    schedule();
  }
}

// Cache hits can play while another clip is encoding. Only misses enter the encode queue.
async function checkCache(job: PreviewJob) {
  let path: string;
  try {
    path = await job.request(true);
  } catch (error) {
    if (jobs.get(job.key) !== job) return;
    jobs.delete(job.key);
    for (const demand of job.demands) demand.onError(error);
    return;
  }
  if (jobs.get(job.key) !== job) return;
  if (path) {
    jobs.delete(job.key);
    for (const demand of job.demands) demand.onReady(path);
  } else {
    job.needsEncode = true;
    schedule();
  }
}

export function queueGridVideoPreview(
  key: string,
  request: (cacheOnly: boolean) => Promise<string>,
  demand: PreviewDemand,
) {
  let job = jobs.get(key);
  if (!job) {
    job = { key, request, needsEncode: false, demands: new Set() };
    jobs.set(key, job);
    void checkCache(job);
  }
  const queuedJob = job;
  queuedJob.demands.add(demand);
  if (queuedJob.needsEncode) schedule();

  return () => {
    queuedJob.demands.delete(demand);
    // A dispatched encode may finish and populate the disk cache. Keep its entry
    // until then so coming back to the same clip can reuse that request.
    if (queuedJob !== activeJob && queuedJob.demands.size === 0 && jobs.get(key) === queuedJob) {
      jobs.delete(key);
    }
    if (jobs.size === 0) {
      cancelScrollWait?.();
      cancelScrollWait = undefined;
    }
  };
}
