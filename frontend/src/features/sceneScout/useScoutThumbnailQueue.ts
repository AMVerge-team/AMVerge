import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStateStore } from "../../stores/appStore";

const MAX_CONCURRENCY = 2;
const MAX_CACHE_SIZE = 300;
const THUMB_CACHE = new Map<string, string>();

function cacheSet(key: string, value: string): void {
  if (THUMB_CACHE.size >= MAX_CACHE_SIZE) {
    const oldestKey = THUMB_CACHE.keys().next().value;
    if (oldestKey) THUMB_CACHE.delete(oldestKey);
  }
  THUMB_CACHE.set(key, value);
}

/** marks clips as having their thumbnail settled, with the frame when one was found */
function applyThumbnails(thumbs: Map<string, string | null>): void {
  const state = useAppStateStore.getState();
  state.setClips(
    state.clips.map((c) => {
      if (!thumbs.has(c.id)) return c;
      const thumbnail = thumbs.get(c.id);
      return thumbnail ? { ...c, thumbnail, scoutNeedsThumb: false } : { ...c, scoutNeedsThumb: false };
    })
  );
}

/** shows a frame right away for hits without a stored thumbnail, while the database backfill writes the permanent one */
export function useScoutThumbnailQueue(): void {
  const clips = useAppStateStore((s) => s.clips);
  const importToken = useAppStateStore((s) => s.importToken);

  const activeWorkersRef = useRef(0);
  // survives re-runs: every finished thumbnail changes `clips`, and the others must not restart
  const inFlightRef = useRef(new Set<string>());
  const epochRef = useRef(0);

  useEffect(() => {
    const epoch = ++epochRef.current;
    const cached = new Map<string, string | null>();
    const queue: Array<{ id: string; src: string; startSec: number }> = [];

    for (const clip of clips) {
      if (!clip.scoutNeedsThumb || inFlightRef.current.has(clip.id)) continue;
      const hit = THUMB_CACHE.get(clip.id);
      if (hit) cached.set(clip.id, hit);
      else queue.push({ id: clip.id, src: clip.originalPath || clip.src, startSec: clip.startSec ?? 0 });
    }
    if (cached.size) applyThumbnails(cached);

    const pump = () => {
      while (activeWorkersRef.current < MAX_CONCURRENCY && queue.length && epoch === epochRef.current) {
        const job = queue.shift()!;
        activeWorkersRef.current += 1;
        inFlightRef.current.add(job.id);

        invoke<string | null>("extract_scout_thumbnail_memory", { videoPath: job.src, timestampSec: job.startSec })
          .catch(() => null)
          .then((dataUrl) => {
            if (dataUrl) cacheSet(job.id, dataUrl);
            applyThumbnails(new Map([[job.id, dataUrl]]));
          })
          .finally(() => {
            inFlightRef.current.delete(job.id);
            activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
            pump();
          });
      }
    };
    pump();

    return () => {
      epochRef.current += 1;
    };
  }, [clips, importToken]);
}
