import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStateStore } from "../../stores/appStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

const MAX_CONCURRENCY = 2;
const MAX_CACHE_SIZE = 300;
const THUMB_CACHE = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  return THUMB_CACHE.get(key);
}

function cacheSet(key: string, value: string): void {
  if (THUMB_CACHE.size >= MAX_CACHE_SIZE) {
    const oldestKey = THUMB_CACHE.keys().next().value;
    if (oldestKey) THUMB_CACHE.delete(oldestKey);
  }
  THUMB_CACHE.set(key, value);
}

export function useScoutThumbnailQueue(): void {
  const clips = useAppStateStore((s) => s.clips);
  const dynamicEnabled = useSceneScoutStore((s) => s.settings.dynamicThumbnails ?? true);
  const importToken = useAppStateStore((s) => s.importToken);

  const activeWorkersRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const pendingClipsRef = useRef(new Map<string, { src: string; startSec: number }>());
  const cancelledEpochRef = useRef(0);

  useEffect(() => {
    cancelledEpochRef.current += 1;
    const currentEpoch = cancelledEpochRef.current;

    if (!dynamicEnabled) {
      queueRef.current = [];
      pendingClipsRef.current.clear();
      return;
    }

    const needed: string[] = [];
    const clipMap = new Map<string, { src: string; startSec: number }>();
    const immediateUpdates: Array<{ id: string; thumbnail: string }> = [];

    for (const clip of clips) {
      if (!clip.scoutNeedsThumb) continue;
      const cached = cacheGet(clip.id);
      if (cached) {
        immediateUpdates.push({ id: clip.id, thumbnail: cached });
      } else {
        needed.push(clip.id);
        clipMap.set(clip.id, {
          src: clip.originalPath || clip.src,
          startSec: clip.startSec ?? 0,
        });
      }
    }

    if (immediateUpdates.length > 0) {
      const state = useAppStateStore.getState();
      const updatedClips = state.clips.map((c) => {
        const match = immediateUpdates.find((u) => u.id === c.id);
        if (match) {
          return { ...c, thumbnail: match.thumbnail, scoutNeedsThumb: false };
        }
        return c;
      });
      state.setClips(updatedClips);
    }

    queueRef.current = needed;
    pendingClipsRef.current = clipMap;

    const pumpQueue = async () => {
      while (
        activeWorkersRef.current < MAX_CONCURRENCY &&
        queueRef.current.length > 0 &&
        currentEpoch === cancelledEpochRef.current
      ) {
        const nextId = queueRef.current.shift();
        if (!nextId) break;

        const info = pendingClipsRef.current.get(nextId);
        if (!info) continue;

        activeWorkersRef.current += 1;

        (async () => {
          try {
            const dataUrl = await invoke<string | null>(
              "extract_scout_thumbnail_memory",
              {
                videoPath: info.src,
                timestampSec: info.startSec,
              }
            );

            if (currentEpoch !== cancelledEpochRef.current) return;

            const state = useAppStateStore.getState();
            if (dataUrl) {
              cacheSet(nextId, dataUrl);
              state.setClips(
                state.clips.map((c) =>
                  c.id === nextId
                    ? { ...c, thumbnail: dataUrl, scoutNeedsThumb: false }
                    : c
                )
              );
            } else {
              state.setClips(
                state.clips.map((c) =>
                  c.id === nextId ? { ...c, scoutNeedsThumb: false } : c
                )
              );
            }
          } catch {
            if (currentEpoch === cancelledEpochRef.current) {
              const state = useAppStateStore.getState();
              state.setClips(
                state.clips.map((c) =>
                  c.id === nextId ? { ...c, scoutNeedsThumb: false } : c
                )
              );
            }
          } finally {
            activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
            if (currentEpoch === cancelledEpochRef.current) {
              void pumpQueue();
            }
          }
        })();
      }
    };

    void pumpQueue();

    return () => {
      cancelledEpochRef.current += 1;
    };
  }, [clips, dynamicEnabled, importToken]);
}
