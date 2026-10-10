import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ClipItem } from "../../types/domain";

// milliseconds a supposedly-supported HEVC variant gets to produce a frame before
// we give up and proxy it anyway
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

  // removing a <video> from the DOM does not free chromium's decoder until GC, and
  // hover plus scroll churn accumulates zombie players until every new video fails
  // with MEDIA_ERR_SRC_NOT_SUPPORTED. clearing src and calling load() in cleanup
  // releases the player synchronously.
  //
  // the setup half restores a stripped src attribute because StrictMode re-runs
  // cleanup and setup on the SAME element, and React will not re-apply a src prop
  // it considers unchanged. must run before the playback effect so the src is back
  // by the time playback calls load()
  useEffect(() => {
    if (!shouldMountVideo) return;
    // capture the element now: refs detach before passive cleanup runs, and
    // releasing a detached element still frees its media player
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

  // play on hover, or in preview-all once the stagger queue reaches this tile.
  // otherwise pause and rewind so the next hover starts from the beginning
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

  // some HEVC variants report as supported but black-screen in HTML video, so if
  // no frame arrives shortly after playback starts, force the proxy fallback.
  // clip files are pre-cut H.264 and never need this
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

      // video mode plays the pre-cut H.264 clip directly, so the source-proxy
      // fallback below would transcode the full episode and set an effectiveSrc
      // that video mode ignores. retry the clip itself once instead, since
      // transient decoder and IO hiccups recover on a fresh load
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
