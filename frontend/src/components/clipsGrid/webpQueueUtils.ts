import { SceneWebpJob } from "./types";
import { WebpKind, WebpQueueContext } from "./webpQueueTypes";

export const MAX_WEBP_DURATION_SECS = 15;

export function clampWebpEnd(startSec?: number, endSec?: number): { start: number; end: number } {
  const start = startSec ?? 0;
  const rawEnd = endSec ?? start + 2;
  const end = Math.min(rawEnd > start ? rawEnd : start + 2, start + MAX_WEBP_DURATION_SECS);
  return { start, end };
}

export function webpFpsForRange(start: number, end: number): number {
  const duration = Math.max(0, end - start);
  if (duration <= 4) return 8;
  if (duration <= 8) return 6;
  return 5;
}

export function makeDemandKey(clipId: string, kind: WebpKind): string {
  return `${clipId}::${kind}`;
}

export function parseDemandKey(demandKey: string): { clipId: string; kind: WebpKind } {
  const sep = demandKey.lastIndexOf("::");
  if (sep === -1) return { clipId: demandKey, kind: "animated" };
  const clipId = demandKey.slice(0, sep);
  const kind = demandKey.slice(sep + 2) as WebpKind;
  return { clipId, kind };
}

export function normalizeWebpKind(_kind?: string): WebpKind {
  return "animated";
}

export function buildDemandJob(
  demandKey: string,
  sourceJob: Omit<SceneWebpJob, "sceneId">,
  kind: WebpKind,
  context: WebpQueueContext
): SceneWebpJob {
  return {
    sceneId: demandKey,
    sourcePath: sourceJob.sourcePath,
    start: sourceJob.start,
    end: sourceJob.end,
    fps: sourceJob.fps,
    kind,
    episodeCacheId: sourceJob.episodeCacheId ?? context.episodeCacheId ?? null,
    customPath: context.customPath ?? null,
  };
}
