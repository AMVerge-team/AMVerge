import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ClipItem } from "../../types/domain";

// how long a supposedly playable HEVC source gets to show a frame before it is proxied anyway
const HEVC_STALL_TIMEOUT_MS = 1200;
const CLIP_RETRY_DELAY_MS = 300;

type Params = {
  clip: ClipItem;
  isVideoMode: boolean;
  isHovered: boolean;
  gridPreview: boolean;
  staggerReady: boolean;
  showVideo: boolean;
  shouldMountVideo: boolean;
  videoSrcUrl: string | null;
  effectiveSrc: string;
  originalPath: string;
  videoIsHEVC: boolean | null;
  audioPlaybackHover: boolean;
  playbackVolume: number;
  gridPreviewSpeed: number;
  resetKey: unknown;
  videoRef: RefObject<HTMLVideoElement | null>;
  setEffectiveSrc: (src: string) => void;
  ensurePreviewProxyPath: (clipPath: string, priority: boolean, transcodeVideo: boolean) => Promise<string>;
  proxyInFlightRef: RefObject<boolean>;
  restartPlayback: () => void;
  startTime?: number;
  endTime?: number;
};

export function useClipVideoElement({
  clip,
  isVideoMode,
  isHovered,
  gridPreview,
  staggerReady,
  showVideo,
  shouldMountVideo,
  videoSrcUrl,
  effectiveSrc,
  originalPath,
  videoIsHEVC,
  audioPlaybackHover,
  playbackVolume,
  gridPreviewSpeed,
  resetKey,
  videoRef,
  setEffectiveSrc,
  ensurePreviewProxyPath,
  proxyInFlightRef,
  restartPlayback,
  startTime,
  endTime,
}: Params) {
  const hasReportedErrorRef = useRef(false);
  const hasFirstFrameRef = useRef(false);
  const frameCallbackIdRef = useRef<number | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
  }, []);

  const cancelFrameCallback = useCallback((el: HTMLVideoElement | null) => {
    if (!el || frameCallbackIdRef.current === null) return;
    const cancel = (el as any).cancelVideoFrameCallback;
    if (cancel) {
      try {
        cancel.call(el, frameCallbackIdRef.current);
      } catch {}
    }
    frameCallbackIdRef.current = null;
  }, []);

  const requestFirstFrame = useCallback((video: HTMLVideoElement) => {
    if (hasFirstFrameRef.current) return;
    if (!(video as any).requestVideoFrameCallback) return;
    if (frameCallbackIdRef.current) return;
    try {
      frameCallbackIdRef.current = (video as any).requestVideoFrameCallback(() => {
        hasFirstFrameRef.current = true;
        frameCallbackIdRef.current = null;
        setIsVideoReady(true);
      });
    } catch {}
  }, []);

  // a source swap re-arms error handling and thumbnail gating
  useEffect(() => {
    cancelFrameCallback(videoRef.current);
    hasReportedErrorRef.current = false;
    hasFirstFrameRef.current = false;
    setIsVideoReady(false);
  }, [effectiveSrc, resetKey, cancelFrameCallback]);

  // cleanup clears src + load() so chromium frees the decoder now (zombies break new videos); setup restores src for StrictMode, before playback runs
  useEffect(() => {
    if (!shouldMountVideo) return;
    // captured now: the ref detaches before cleanup runs
    const v = videoRef.current;
    if (!v) return;
    if (videoSrcUrl && v.getAttribute("src") !== videoSrcUrl) {
      v.setAttribute("src", videoSrcUrl);
      try {
        v.load();
      } catch {}
    }
    return () => {
      cancelFrameCallback(v);
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {}
    };
  }, [shouldMountVideo, videoSrcUrl, cancelFrameCallback]);

  // play on hover or on this tile's preview-all turn; otherwise pause and rewind
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const shouldPlay = isVideoMode
      ? isHovered || (gridPreview && staggerReady)
      : showVideo && shouldMountVideo;

    if (!shouldPlay) {
      v.pause();
      v.muted = true;
      try {
        v.currentTime = startTime !== undefined && isFinite(startTime) ? startTime : 0;
      } catch {}
      return;
    }

    // preview-all stays muted unless this tile is the hovered one
    v.muted = !(isHovered && audioPlaybackHover);
    v.volume = playbackVolume;
    v.autoplay = true;
    v.loop = startTime === undefined;
    v.playbackRate = Math.max(0.25, Math.min(3, gridPreviewSpeed));

    if (startTime !== undefined && isFinite(startTime) && startTime > 0) {
      if (Math.abs(v.currentTime - startTime) > 0.5) {
        try {
          v.currentTime = startTime;
        } catch {}
      }
    }

    if (v.readyState === 0) {
      try {
        v.load();
      } catch {}
    }
    v.play().catch(() => {});
  }, [
    isVideoMode,
    gridPreview,
    staggerReady,
    showVideo,
    shouldMountVideo,
    effectiveSrc,
    isHovered,
    audioPlaybackHover,
    playbackVolume,
    gridPreviewSpeed,
    startTime,
  ]);

  // some HEVC variants claim support but render black, so no early frame forces the proxy (cut clips are H.264)
  useEffect(() => {
    if (isVideoMode) return;
    if (!showVideo || !shouldMountVideo) return;
    if (videoIsHEVC !== true) return;
    if (effectiveSrc !== originalPath) return;

    const timeout = window.setTimeout(async () => {
      const v = videoRef.current;
      if (!v || proxyInFlightRef.current) return;
      if (effectiveSrc !== originalPath) return;
      if (hasFirstFrameRef.current || v.readyState >= 2) return;

      try {
        proxyInFlightRef.current = true;
        const proxyPath = await ensurePreviewProxyPath(originalPath, isHovered, true);
        if (!proxyPath) return;
        setEffectiveSrc(proxyPath);
        restartPlayback();
      } catch {} finally {
        proxyInFlightRef.current = false;
      }
    }, HEVC_STALL_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [
    isVideoMode,
    showVideo,
    shouldMountVideo,
    videoIsHEVC,
    effectiveSrc,
    originalPath,
    isHovered,
    ensurePreviewProxyPath,
    setEffectiveSrc,
    proxyInFlightRef,
    restartPlayback,
  ]);

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (!gridPreview && !isHovered) return;
      const v = e.currentTarget;
      v.muted = !(isHovered && audioPlaybackHover);
      v.volume = playbackVolume;
      if (startTime !== undefined && isFinite(startTime) && startTime > 0) {
        try {
          v.currentTime = startTime;
        } catch {}
      }
      v.play().catch(() => {});
    },
    [gridPreview, isHovered, audioPlaybackHover, playbackVolume, startTime]
  );

  const handleLoadedData = useCallback(() => {
    hasFirstFrameRef.current = true;
    setIsVideoReady(true);
  }, []);

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (startTime === undefined || endTime === undefined) return;
      const v = e.currentTarget;
      if (v.currentTime >= endTime || v.currentTime < (startTime - 0.2)) {
        try {
          v.currentTime = startTime;
        } catch {}
      }
    },
    [startTime, endTime]
  );

  const handleEnded = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      if (startTime !== undefined) {
        try {
          v.currentTime = startTime;
          v.play().catch(() => {});
        } catch {}
      }
    },
    [startTime]
  );

  // clear transient error and readiness flags so the next hover can try again
  const resetOnLeave = useCallback(() => {
    hasReportedErrorRef.current = false;
    setIsVideoReady(false);
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.currentTime = startTime !== undefined && isFinite(startTime) ? startTime : 0;
      } catch {}
    }
  }, [startTime]);

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (hasReportedErrorRef.current) return;
      hasReportedErrorRef.current = true;

      // already on a proxy: nothing left to fall back to, so stay on the thumbnail
      if (effectiveSrc !== originalPath) return;

      const errorCode = e.currentTarget.error?.code ?? null;
      if (import.meta.env.DEV) console.log(`Error on video -> CODE: ${errorCode}`);

      invoke("hover_preview_error", {
        clipId: clip.id,
        clipPath: isVideoMode ? clip.clipPath ?? originalPath : originalPath,
        errorCode,
      }).catch(() => {});

      // video mode retries the cut clip once; the source proxy below would transcode the whole episode for nothing
      if (isVideoMode) {
        const vid = videoRef.current;
        window.setTimeout(() => {
          if (!vid || !vid.isConnected) return;
          hasReportedErrorRef.current = false;
          try {
            vid.load();
            vid.play().catch(() => {});
          } catch {}
        }, CLIP_RETRY_DELAY_MS);
        return;
      }

      if (proxyInFlightRef.current) return;
      proxyInFlightRef.current = true;

      void (async () => {
        try {
          const proxyPath = await ensurePreviewProxyPath(originalPath, true, true);
          if (!proxyPath) return;
          setEffectiveSrc(proxyPath);
          setTimeout(() => {
            const vid = videoRef.current;
            if (!vid) return;
            vid.muted = !(isHovered && audioPlaybackHover);
            vid.volume = playbackVolume;
            vid.load();
            vid.play().catch(() => {});
          }, 0);
        } catch {} finally {
          proxyInFlightRef.current = false;
        }
      })();
    },
    [
      clip.id,
      clip.clipPath,
      isVideoMode,
      effectiveSrc,
      originalPath,
      isHovered,
      audioPlaybackHover,
      playbackVolume,
      ensurePreviewProxyPath,
      setEffectiveSrc,
      proxyInFlightRef,
    ]
  );

  return {
    setVideoRef,
    isVideoReady,
    requestFirstFrame,
    handleLoadedMetadata,
    handleLoadedData,
    handleTimeUpdate,
    handleEnded,
    handleError,
    resetOnLeave,
  };
}
