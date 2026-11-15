/** WebP-preview-mode logic for a clip tile: static thumbnail, animated source, and demand reporting */
import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ClipItem } from "../../types/domain";
import { SceneWebpJob } from "./types";
import { cancelIdle, scheduleIdle, type IdleHandle } from "../../utils/idle";
import { imageThumbnail } from "../../utils/mediaSrc";
import { clampWebpEnd, webpFpsForRange } from "./webpQueueUtils";

const WEBP_THUMBNAIL_CACHE = new Map<string, string>();
// keys include the importToken, so every reopen adds entries; capped, oldest evicted first
const WEBP_THUMBNAIL_CACHE_MAX = 400;

function cacheWebpThumbnail(key: string, dataUrl: string) {
  if (WEBP_THUMBNAIL_CACHE.size >= WEBP_THUMBNAIL_CACHE_MAX) {
    const excess = WEBP_THUMBNAIL_CACHE.size - WEBP_THUMBNAIL_CACHE_MAX + 1;
    let dropped = 0;
    for (const oldest of WEBP_THUMBNAIL_CACHE.keys()) {
      WEBP_THUMBNAIL_CACHE.delete(oldest);
      if (++dropped >= excess) break;
    }
  }
  WEBP_THUMBNAIL_CACHE.set(key, dataUrl);
}

/** a static jpeg of a WebP's first frame as a flicker-free base layer; `enabled` gates new decodes to visible tiles */
function useWebpThumbnail(webpSrc: string | undefined, enabled: boolean): string | null {
  const [thumbnail, setThumbnail] = useState<string | null>(
    () => (webpSrc ? (WEBP_THUMBNAIL_CACHE.get(webpSrc) ?? null) : null)
  );

  useEffect(() => {
    if (!webpSrc) { setThumbnail(null); return; }
    const cached = WEBP_THUMBNAIL_CACHE.get(webpSrc);
    if (cached) { setThumbnail(cached); return; }
    if (!enabled) return;

    let cancelled = { value: false };
    let idleHandle: IdleHandle | null = null;
    let activeImg: HTMLImageElement | null = null;

    const extractFromWebp = () => {
      if (cancelled.value) return;
      const img = new Image();
      activeImg = img;
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled.value) return;
        idleHandle = scheduleIdle(() => {
          if (cancelled.value) return;
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
            cacheWebpThumbnail(webpSrc, dataUrl);
            setThumbnail(dataUrl);
          } catch {
            // canvas tainted or decode failed, no thumbnail extracted
          }
        });
      };
      img.src = webpSrc;
    };

    const companionJpgUrl = webpSrc.replace(/\.webp(\?|$)/i, ".jpg$1");
    if (companionJpgUrl !== webpSrc) {
      const posterImg = new Image();
      activeImg = posterImg;
      posterImg.onload = () => {
        if (cancelled.value) return;
        cacheWebpThumbnail(webpSrc, companionJpgUrl);
        setThumbnail(companionJpgUrl);
      };
      posterImg.onerror = () => {
        if (!cancelled.value) extractFromWebp();
      };
      posterImg.src = companionJpgUrl;
    } else {
      extractFromWebp();
    }

    return () => {
      cancelled.value = true;
      if (activeImg) {
        activeImg.onload = null;
        activeImg.onerror = null;
        // an abandoned in-flight <img> keeps the decoded animation alive until GC
        activeImg.src = "";
      }
      if (idleHandle !== null) cancelIdle(idleHandle);
    };
  }, [webpSrc, enabled]);

  return thumbnail;
}

type UseWebpPreviewArgs = {
  clip: ClipItem;
  index: number;
  importToken: string;
  isVisible: boolean;
  isHovered: boolean;
  videoPreviewMode: boolean;
  isVideoMode: boolean;
  episodeId?: string;
  previewWebpPath?: string;
  reportWebpDemand: (
    clipId: string,
    demand: {
      isVisible: boolean;
      order: number;
      priority: boolean;
      job: Omit<SceneWebpJob, "sceneId">;
    } | null
  ) => void;
};

/** the animated-WebP encode job for a clip, or null if it has no source */
export function buildWebpJob(
  clip: { originalPath?: string; src: string; startSec?: number; endSec?: number },
  episodeCacheId: string | null
): Omit<SceneWebpJob, "sceneId"> | null {
  const sourcePath = clip.originalPath || clip.src;
  if (!sourcePath) return null;

  const { start, end } = clampWebpEnd(clip.startSec, clip.endSec);

  return { sourcePath, start, end, fps: webpFpsForRange(start, end), kind: "animated", episodeCacheId };
}

export function useWebpPreview({
  clip,
  index,
  importToken,
  isVisible,
  isHovered,
  videoPreviewMode,
  isVideoMode,
  episodeId,
  previewWebpPath,
  reportWebpDemand,
}: UseWebpPreviewArgs) {
  const webpSourcePath = clip.originalPath || clip.src;
  const { start: webpStart, end: webpEnd } = clampWebpEnd(clip.startSec, clip.endSec);

  const hasAnimatedWebp = Boolean(previewWebpPath);
  // never clip.src: a webp episode's src is the whole source video, which an <img> reads entirely into memory
  const displayThumbnailPath = imageThumbnail(clip.thumbnail) ?? "";

  const webpFileSrc = previewWebpPath
    ? `${convertFileSrc(previewWebpPath)}?v=${importToken}`
    : undefined;
  const webpThumbnail = useWebpThumbnail(webpFileSrc, isVisible);

  const [thumbnailSrc, setThumbnailSrc] = useState(displayThumbnailPath);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  // request scene preview assets using viewport and hover priority
  useEffect(() => {
    // video-preview mode never generates WebPs, scenes are shown as video clips
    if (videoPreviewMode || isVideoMode) {
      reportWebpDemand(clip.id, null);
      return;
    }

    if (!webpSourcePath) {
      reportWebpDemand(clip.id, null);
      return;
    }

    if (previewWebpPath) {
      reportWebpDemand(clip.id, null);
      return;
    }

    const webpFps = webpFpsForRange(webpStart, webpEnd);
    reportWebpDemand(clip.id, {
      isVisible,
      order: index,
      priority: isHovered,
      job: {
        sourcePath: webpSourcePath,
        start: webpStart,
        end: webpEnd,
        fps: webpFps,
        kind: "animated",
        episodeCacheId: episodeId ?? null,
      },
    });

    // unmounting drops to background priority instead of withdrawing, so the total doesn't shrink on scroll
    return () => {
      reportWebpDemand(clip.id, {
        isVisible: false,
        order: index,
        priority: false,
        job: {
          sourcePath: webpSourcePath,
          start: webpStart,
          end: webpEnd,
          fps: webpFps,
          kind: "animated",
          episodeCacheId: episodeId ?? null,
        },
      });
    };
  }, [
    clip.id,
    index,
    isHovered,
    isVideoMode,
    videoPreviewMode,
    isVisible,
    previewWebpPath,
    reportWebpDemand,
    webpEnd,
    webpSourcePath,
    webpStart,
    episodeId,
  ]);

  // keep thumbnail rendering resilient: reset load state when source changes
  useEffect(() => {
    setThumbnailSrc(displayThumbnailPath);
    setThumbnailLoaded(false);
    setThumbnailFailed(false);
  }, [displayThumbnailPath, importToken]);

  // a new WebP clears thumbnailFailed so the img can retry from it
  useEffect(() => {
    if (previewWebpPath) setThumbnailFailed(false);
  }, [previewWebpPath]);

  // the poster failed: show the skeleton until the webp arrives, rather than falling back to the video
  const handleThumbnailError = useCallback(() => {
    setThumbnailFailed(true);
  }, []);

  return {
    displayThumbnailPath,
    hasAnimatedWebp,
    webpThumbnail,
    thumbnailSrc,
    thumbnailLoaded,
    setThumbnailLoaded,
    thumbnailFailed,
    handleThumbnailError,
  };
}
