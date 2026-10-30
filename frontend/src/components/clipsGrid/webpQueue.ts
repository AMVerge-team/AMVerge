import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { buildDemandJob, makeDemandKey, normalizeWebpKind, parseDemandKey } from "./webpQueueUtils";
import { useScenePreviewStore } from "../../stores/scenePreviewStore";
import { useWebpLoadingStore } from "../../stores/webpLoadingStore";
import {
  QueueDemand,
  SceneWebpBatchItem,
  SceneWebpBatchResult,
  WebpDemandInput,
  WebpPrimeJob,
  WebpQueueContext,
} from "./webpQueueTypes";

// visible tiles get quick batches, offscreen ones a slow background trickle
const VISIBLE_BATCH_SIZE = 16;
const OFFSCREEN_BATCH_SIZE = 1;
const OFFSCREEN_BATCH_DELAY_MS = 250;

// when an episode opens, the disk-cache prime can resolve a few hundred WebPs at once
const PRIME_PUBLISH_CHUNK = 24;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

const WEBP_DEBUG = false;

function webpLog(message: string, payload?: Record<string, unknown>): void {
  if (!WEBP_DEBUG) return;
  if (payload) {
    console.log(`[WEBP_QUEUE] ${message}`, payload);
    return;
  }
  console.log(`[WEBP_QUEUE] ${message}`);
}

type BatchPlan = {
  batch: QueueDemand[];
  offscreenOnly: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function useViewportAwareWebpQueue(context: WebpQueueContext = {}) {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const demandRef = useRef<Map<string, QueueDemand>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const seqRef = useRef(0);
  const processingRef = useRef(false);
  const epochRef = useRef(0);
  const contextRef = useRef(context);
  contextRef.current = context;
  const pendingLoadRef = useRef<Set<string>>(new Set());
  const loadTotalRef = useRef(0);
  const loadDoneRef = useRef(0);

  const publishLoadProgress = useCallback(() => {
    useWebpLoadingStore.getState().setProgress(loadTotalRef.current, loadDoneRef.current);
  }, []);

  const markLoading = useCallback((demandKey: string) => {
    if (pendingLoadRef.current.has(demandKey)) return;
    pendingLoadRef.current.add(demandKey);
    loadTotalRef.current += 1;
    publishLoadProgress();
  }, [publishLoadProgress]);

  // resolved counts toward done; cancelled demand just leaves the total; all done resets to 0/0
  const finishLoading = useCallback((demandKey: string, resolved: boolean) => {
    if (!pendingLoadRef.current.has(demandKey)) return;
    pendingLoadRef.current.delete(demandKey);
    if (resolved) {
      loadDoneRef.current += 1;
    } else {
      loadTotalRef.current = Math.max(loadDoneRef.current, loadTotalRef.current - 1);
    }
    if (pendingLoadRef.current.size === 0) {
      loadTotalRef.current = 0;
      loadDoneRef.current = 0;
    }
    publishLoadProgress();
  }, [publishLoadProgress]);

  const resetLoadProgress = useCallback(() => {
    pendingLoadRef.current.clear();
    loadTotalRef.current = 0;
    loadDoneRef.current = 0;
    useWebpLoadingStore.getState().reset();
  }, []);

  const publishResult = useCallback((demandKey: string, path: string) => {
    const { clipId } = parseDemandKey(demandKey);
    useScenePreviewStore.getState().setAnimated(clipId, path);
  }, []);

  const rankCandidates = useCallback((a: QueueDemand, b: QueueDemand): number => {
    const aPriority = a.priority ? 1 : 0;
    const bPriority = b.priority ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    if (a.order !== b.order) return a.order - b.order;
    return b.seq - a.seq;
  }, []);

  const hasVisiblePending = useCallback((): boolean => {
    for (const [demandKey, demand] of demandRef.current) {
      if (!demand.isVisible) continue;
      if (cacheRef.current.has(demandKey)) continue;
      if (inFlightRef.current.has(demandKey)) continue;
      return true;
    }
    return false;
  }, []);

  const pickNextBatch = useCallback((): BatchPlan => {
    const candidates: QueueDemand[] = [];
    for (const [demandKey, demand] of demandRef.current) {
      if (cacheRef.current.has(demandKey)) continue;
      if (inFlightRef.current.has(demandKey)) continue;
      candidates.push(demand);
    }

    const visible = candidates.filter((demand) => demand.isVisible).sort(rankCandidates);
    if (visible.length > 0) {
      webpLog("lane=visible", {
        pendingVisible: visible.length,
        pendingOffscreen: candidates.length - visible.length,
      });
      return {
        batch: visible.slice(0, VISIBLE_BATCH_SIZE),
        offscreenOnly: false,
      };
    }

    const offscreen = candidates.filter((demand) => !demand.isVisible).sort(rankCandidates);
    if (offscreen.length > 0) {
      webpLog("lane=offscreen", {
        pendingOffscreen: offscreen.length,
      });
    }
    return {
      batch: offscreen.slice(0, OFFSCREEN_BATCH_SIZE),
      offscreenOnly: offscreen.length > 0,
    };
  }, [rankCandidates]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      while (true) {
        // paused from the progress card: demands keep accumulating, nothing new is encoded until resume
        if (useWebpLoadingStore.getState().pausedEpisodeId) break;
        const { batch, offscreenOnly } = pickNextBatch();
        if (batch.length === 0) break;

        webpLog("dispatch batch", {
          size: batch.length,
          offscreenOnly,
          demandKeys: batch.map((demand) => demand.demandKey),
        });

        const epoch = epochRef.current;
        for (const demand of batch) {
          inFlightRef.current.add(demand.demandKey);
        }

        try {
          const result = await invoke<SceneWebpBatchResult>("generate_scene_webp_batch", {
            jobs: batch.map((demand) => demand.job),
          });

          // a batch from before an episode switch is cached but not published
          const fresh = epoch === epochRef.current;
          for (const item of result.items ?? []) {
            // item.sceneId echoes back the demand key we sent
            if (item.path) {
              cacheRef.current.set(item.sceneId, item.path);
              finishLoading(item.sceneId, true);
              if (fresh) publishResult(item.sceneId, item.path);
            }
            if (item.error) {
              finishLoading(item.sceneId, false);
              if (fresh) demandRef.current.delete(item.sceneId);
            }
          }
        } catch {
          if (epoch === epochRef.current) {
            for (const demand of batch) {
              demandRef.current.delete(demand.demandKey);
            }
          }
          for (const demand of batch) {
            finishLoading(demand.demandKey, false);
          }
        } finally {
          for (const demand of batch) {
            inFlightRef.current.delete(demand.demandKey);
          }
        }

        // keep background preloading gentle so scrolling stays responsive
        if (offscreenOnly && !hasVisiblePending()) {
          webpLog("offscreen cooldown", { delayMs: OFFSCREEN_BATCH_DELAY_MS });
          await sleep(OFFSCREEN_BATCH_DELAY_MS);
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [finishLoading, hasVisiblePending, pickNextBatch, publishResult]);

  const reportWebpDemand = useCallback(
    (clipId: string, demand: WebpDemandInput | null) => {
      if (!demand) {
        // clearing demand for a clip removes both kinds (tile left viewport)
        const animatedKey = makeDemandKey(clipId, "animated");
        demandRef.current.delete(animatedKey);
        // an in-flight encode resolves on its own, so only idle demand leaves the count
        if (!inFlightRef.current.has(animatedKey)) {
          finishLoading(animatedKey, false);
        }
        return;
      }

      const kind = normalizeWebpKind(demand.job.kind);
      const demandKey = makeDemandKey(clipId, kind);

      if (cacheRef.current.has(demandKey)) {
        const cachedPath = cacheRef.current.get(demandKey);
        if (cachedPath) publishResult(demandKey, cachedPath);
        return;
      }

      // genuinely needs backend work, count it toward the loading bar
      markLoading(demandKey);

      const seq = ++seqRef.current;
      webpLog("enqueue", {
        clipId,
        demandKey,
        isVisible: demand.isVisible,
        priority: demand.priority,
        order: demand.order,
      });
      demandRef.current.set(demandKey, {
        demandKey,
        clipId,
        kind,
        isVisible: demand.isVisible,
        order: demand.order,
        priority: demand.priority,
        seq,
        // sceneId carries the demand key so the Rust result can be routed back to kind
        job: buildDemandJob(demandKey, demand.job, kind, contextRef.current),
      });

      void processQueue();
    },
    [finishLoading, markLoading, processQueue, publishResult]
  );

  const primeFromDiskCache = useCallback(async (jobs: WebpPrimeJob[]) => {
    const context = contextRef.current;
    // jobs need a cache id, their own (Scenepacks) or the queue's (home)
    const cacheableJobs = jobs.filter((job) => Boolean(job.episodeCacheId ?? context.episodeCacheId));
    if (cacheableJobs.length === 0) {
      webpLog("prime cache skipped", { reason: "missing episodeCacheId" });
      return;
    }

    // clips resolved this session republish from memory; only new clips hit the backend
    const pending: WebpPrimeJob[] = [];
    const alreadyCached: Array<[string, string]> = [];
    for (const job of cacheableJobs) {
      const cachedPath = cacheRef.current.get(makeDemandKey(job.clipId, "animated"));
      if (cachedPath) {
        alreadyCached.push([job.clipId, cachedPath]);
        continue;
      }
      pending.push(job);
    }
    // cached results republish in one commit, so switching back to an episode is quick
    if (alreadyCached.length > 0) {
      useScenePreviewStore.getState().setAnimatedMany(alreadyCached);
    }

    if (pending.length === 0) {
      webpLog("prime cache skipped", { reason: "all cached" });
      return;
    }

    webpLog("prime cache start", {
      episodeCacheId: context.episodeCacheId,
      jobs: pending.length,
      customPath: context.customPath ?? null,
    });

    const lookupJobs = pending.map((job) => {
      const demandKey = makeDemandKey(job.clipId, "animated");
      return buildDemandJob(
        demandKey,
        {
          sourcePath: job.sourcePath,
          start: job.start,
          end: job.end,
          fps: job.fps,
          kind: "animated",
          episodeCacheId: job.episodeCacheId,
        },
        "animated",
        context
      );
    });

    const episodeAtStart = context.episodeCacheId;
    try {
      const result = await invoke<SceneWebpBatchResult>("lookup_scene_webp_cache_batch", {
        jobs: lookupJobs,
      });

    // hits in request order, so the grid fills top first
      const hits: Array<[string, string]> = [];
      for (const item of result.items ?? []) {
        const typed = item as SceneWebpBatchItem;
        if (!typed.path) continue;
        cacheRef.current.set(typed.sceneId, typed.path);
        // already on disk: never needed an encode, so it leaves the queue and the loading count
        demandRef.current.delete(typed.sceneId);
        finishLoading(typed.sceneId, false);
        const { clipId } = parseDemandKey(typed.sceneId);
        hits.push([clipId, typed.path]);
      }

      const setMany = useScenePreviewStore.getState().setAnimatedMany;
      for (let i = 0; i < hits.length; i += PRIME_PUBLISH_CHUNK) {
        // the user switched episodes mid-publish; the store is already cleared
        if (contextRef.current.episodeCacheId !== episodeAtStart) break;
        setMany(hits.slice(i, i + PRIME_PUBLISH_CHUNK));
        if (i + PRIME_PUBLISH_CHUNK < hits.length) {
          await nextFrame();
        }
      }

      webpLog("prime cache complete", {
        episodeCacheId: context.episodeCacheId,
        requested: pending.length,
        hits: hits.length,
      });
    } catch (error) {
      webpLog("prime cache failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [finishLoading]);

  const resetWebpQueue = useCallback(() => {
    // drops pending work but keeps cacheRef (keys are unique clip ids); the epoch bump fences in-flight batches
    epochRef.current += 1;
    demandRef.current.clear();
    inFlightRef.current.clear();
    resetLoadProgress();
    useScenePreviewStore.getState().reset();
  }, [resetLoadProgress]);

  // resume picks up exactly the demands that piled up while paused
  useEffect(
    () =>
      useWebpLoadingStore.subscribe((state, prev) => {
        if (prev.pausedEpisodeId && !state.pausedEpisodeId) void processQueue();
      }),
    [processQueue]
  );

  // paints each scene as its encode finishes; only in-flight work is accepted, so stale episode events drop
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<{ sceneId: string; path: string }>("scene_webp_ready", (event) => {
      const { sceneId, path } = event.payload;
      if (!sceneId || !path) return;
      if (!inFlightRef.current.has(sceneId)) return;
      cacheRef.current.set(sceneId, path);
      finishLoading(sceneId, true);
      publishResult(sceneId, path);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [finishLoading, publishResult]);

  return {
    reportWebpDemand,
    primeFromDiskCache,
    resetWebpQueue,
  };
}
