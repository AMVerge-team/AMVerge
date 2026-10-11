import { ClipItem } from "../../types/domain";

export type ClipPatchBuffer = {
  /** queue a patch for one clip; flushed on the next animation frame */
  patch: (clipId: string, patch: Partial<ClipItem>) => void;
  /** apply everything queued right now (e.g. before teardown) */
  flushNow: () => void;
};

/**
 * buffers clip patches by clip id and applies them once per animation frame
 *
 * streamed clip_ready/thumbnail_ready events arrive in bursts, and applying each
 * as its own setState re-renders the whole grid every time. patches for the same
 * clip merge rather than replace, so a clip_ready and a thumbnail_ready landing
 * in one frame do not clobber each other. `apply` receives a mapper that patches
 * any clip it was given a patch for
 */
export function createClipPatchBuffer(apply: (patchClip: (c: ClipItem) => ClipItem) => void): ClipPatchBuffer {
  const pending = new Map<string, Partial<ClipItem>>();
  let frame: number | null = null;

  const flush = () => {
    frame = null;
    if (pending.size === 0) return;
    const snapshot = new Map(pending);
    pending.clear();
    apply((c) => {
      const p = snapshot.get(c.id);
      return p ? { ...c, ...p } : c;
    });
  };

  return {
    patch: (clipId, patch) => {
      pending.set(clipId, { ...(pending.get(clipId) ?? {}), ...patch });
      if (frame === null) frame = requestAnimationFrame(flush);
    },
    flushNow: () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      flush();
    },
  };
}
