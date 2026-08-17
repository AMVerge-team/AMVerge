/**
 * LazyClip.tsx
 *
 * represents a single video tile in the grid. Handles lazy loading, hover preview, proxy logic, and staggered mounting.
 * optimized for performance and compatibility (HEVC/H.264 proxying).
 */
import { memo, useState, useRef, useEffect, useCallback } from "react"
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { LazyClipProps } from "./types.ts"
import { DownloadButton } from "./DownloadButton.tsx";
import { useWebpPreview } from "./useWebpPreview.ts";
import { FaCheck, FaPlus, FaLayerGroup, FaTrashAlt } from "react-icons/fa";
import { useAppStateStore } from "../../stores/appStore.ts";
import { useUIStateStore } from "../../stores/UIStore.ts";
import { useGeneralSettingsStore, useThemeSettingsStore } from "../../stores/settingsStore.ts";
import { usePreviewTranscode } from "../../features/preview/usePreviewTranscode.ts";
import { useScenePreviewStore } from "../../stores/scenePreviewStore.ts";
import { cancelIdle, scheduleIdle } from "../../utils/idle.ts";
import { AddToScenepackModal } from "./AddToScenepackModal.tsx";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore.ts";
import { useScenepacksStore } from "../../stores/scenepackStore.ts";
import { removeClipsFromScenepack } from "../../utils/scenepackStorage.ts";

const DOWNLOAD_TONE_SAMPLE_SIZE = 24;
const DOWNLOAD_TONE_SOURCE_SIZE = 34;
const DOWNLOAD_TONE_SAMPLE_MARGIN = 6;
const DOWNLOAD_TONE_THRESHOLD = 158;

function formatClipTime(seconds?: number | null): string | null {
  if (typeof seconds !== 'number' || isNaN(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const LazyClip = memo(function LazyClip({
  clip,
  index,
  videoPreviewMode,
  requestProxySequential,
  reportProxyDemand,
  reportWebpDemand,
  onClipClick,
  onClipDoubleClick,
  onToggleSelection,
  reportStaggerDemand,
  onDownloadClip,
  onClipContextMenu,
  appearDelayMs,
}: LazyClipProps) {
  const importToken = useAppStateStore(s => s.importToken);

  const previewWebpPath = useScenePreviewStore(s => s.animatedByClipId[clip.id]);

  const isSelected = useAppStateStore(s => s.selectedClips.has(clip.id));
  const isFocused = useAppStateStore(s => s.focusedClipId === clip.id);
  const gridPreview = useUIStateStore(s => s.gridPreview);
  const activePage = useUIStateStore(s => s.activePage);
  const videoIsHEVC = useAppStateStore(s => s.videoIsHEVC);
  const userHasHEVC = useAppStateStore(s => s.userHasHEVC);
  const audioPlaybackHover = useGeneralSettingsStore(s => s.audioPlaybackHover);
  const previewAudioStreamIndex = useGeneralSettingsStore(s => s.previewAudioStreamIndex);
  const selectedMappedAudioStreamIndex =
    previewAudioStreamIndex !== null && previewAudioStreamIndex > 0
      ? previewAudioStreamIndex
      : null;
  const playbackVolume = useGeneralSettingsStore(s => s.playbackVolume);
  const scenepacksEnabled = useGeneralSettingsStore(s => s.scenepacksEnabled);
  const gridPreviewSpeed = useThemeSettingsStore(s => s.gridPreviewSpeed ?? 1);
  const showDownloadButton = useThemeSettingsStore(s => s.showDownloadButton);
  const showClipTimestamps = useThemeSettingsStore(s => s.showClipTimestamps);

  const openedEpisodeId = useEpisodePanelRuntimeStore(s => s.openedEpisodeId);
  const episodeId = clip.episodeId ?? openedEpisodeId ?? clip.id.split("_").slice(0, -1).join("_");

  // ============================ SHARED tile state ============================
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showScenepackModal, setShowScenepackModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLImageElement | null>(null);
  const [downloadTone, setDownloadTone] = useState<"light" | "dark">("light");
  // tracks a pending idle-scheduled tone sample so we can coalesce/cancel it.
  const downloadToneIdleRef = useRef<number | null>(null);

  const originalPath = clip.src;
  // video-file import mode: clip has a pre-cut video file on disk.
  const isVideoMode = Boolean(clip.clipPath) && clip.clipMode !== "failed";
  // is this clip currently being merged or split on the backend?
  const isProcessing = clip.originalName === "Merging..." || clip.originalName === "Splitting...";

  // ========================= VIDEO playback state/refs =======================
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasReportedErrorRef = useRef(false);
  const hasFirstFrameRef = useRef(false);
  const videoFrameCallbackIdRef = useRef<number | null>(null);
  const proxyInFlightRef = useRef(false);
  const mergedPreviewInFlightRef = useRef(false);
  const mergedPreviewFetchedKeyRef = useRef<string | null>(null);

  // staggered mount: only start playback when it's this tile's turn (preview-all
  // lights tiles up top-left → bottom-right instead of all at once).
  const [staggerReady, setStaggerReady] = useState(false);
  const staggerDoneRef = useRef(false);

  // if playback fails, keep showing the thumbnail until proxy is ready
  const [, setForceThumbnail] = useState(false);
  // keep thumbnail visible until video is ready to avoid black screen replacing it
  const [isVideoReady, setIsVideoReady] = useState(false);
  // poster missing or corrupt → skeleton instead of a broken-image icon. retried
  // a couple of times first, since opening an episode reloads hundreds at once.
  const [videoThumbFailed, setVideoThumbFailed] = useState(false);
  const [videoThumbRetry, setVideoThumbRetry] = useState(0);
  const VIDEO_THUMB_MAX_RETRIES = 2;
  // the actual video source (original or proxy)
  const [effectiveSrc, setEffectiveSrc] = useState(clip.src);
  // proxy of the cut clip, keyed by what it was built for so a quality or
  // language change rebuilds it. null = play the cut clip directly.
  const [videoProxy, setVideoProxy] = useState<{ key: string; path: string } | null>(null);
  const [, setMergedPreviewSrc] = useState<string | null>(null);
  const [, setMergedPreviewFailed] = useState(false);
  const mergedSrcsKey = clip.mergedSrcs
    ? `${clip.mergedSrcs.join("|")}::audio:${previewAudioStreamIndex ?? "default"}`
    : null;
  // source itself can't be decoded here, so webp mode needs a proxy to play it
  const needsHevcProxy = videoIsHEVC === true && userHasHEVC === false;
  const { needed: needsPreviewTranscode, preset: transcodePreset } = usePreviewTranscode();
  // excludes isHovered so the key stays stable and hovering doesn't rebuild the proxy
  const proxyAudioStreamIndex =
    selectedMappedAudioStreamIndex !== null && audioPlaybackHover
      ? selectedMappedAudioStreamIndex
      : null;
  // identifies exactly which proxy this tile wants right now.
  const videoProxyKey =
    isVideoMode && clip.clipPath
      ? `${clip.clipPath}::${proxyAudioStreamIndex ?? "na"}::${
          needsPreviewTranscode
            ? `x264_${transcodePreset.height}p${transcodePreset.crf}`
            : "copy"
        }`
      : null;
  const videoProxySrc =
    videoProxy && videoProxy.key === videoProxyKey ? videoProxy.path : null;

  // in video mode, clip files are pre-cut H.264 — mount video element when visible/hovered.
  // in WebP mode, video playback is disabled; hover/preview-all use animated WebP instead.
  const showVideo = isVideoMode;
  // mount on hover or preview-all only, never per visible tile, so the number of
  // live decoders stays bounded. when a transcode is needed, wait for the proxy
  // too — the raw clip would render black until ffmpeg finishes.
  const shouldMountVideo =
    isVideoMode &&
    (isHovered || (gridPreview && staggerReady)) &&
    (!needsPreviewTranscode || Boolean(videoProxySrc));
  // single source of truth for the <video> src — the JSX and the media-release
  // effect below must agree on it so a stripped attribute can be restored.
  const videoSrcUrl = shouldMountVideo
    ? `${convertFileSrc(isVideoMode ? (videoProxySrc ?? clip.clipPath!) : effectiveSrc)}?v=${importToken}`
    : null;
  const shouldShowThumbnail = isVideoMode
    ? (!shouldMountVideo || !isVideoReady)
    : (!showVideo || !shouldMountVideo || !isVideoReady);

  // in video-preview mode, a tile whose clip hasn't been cut yet (and hasn't
  // failed) shows a skeleton until its video arrives via the clip_ready stream.
  const videoClipPending = videoPreviewMode && !isVideoMode && clip.clipMode !== "failed";

  // ============================ WEBP preview state ===========================
  // all thumbnail/animated-WebP state and demand reporting lives in this hook.
  const webp = useWebpPreview({
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
  });
  // show animated WebP on hover, or in preview-all — but only for tiles near the
  // viewport. Selecting WebP mode force-enables preview-all, so without the
  // isVisible gate every clip in the episode animates at once (the grid mounts
  // them all), which is what was killing the WebView2 renderer.
  const shouldShowWebpOverlay =
    webp.hasAnimatedWebp && (isHovered || (gridPreview && isVisible));

  // The static layer falls back to the animated WebP file until the extracted
  // JPEG frame exists — that fallback is only safe for tiles near the viewport,
  // for the same reason.
  const webpStaticReady = Boolean(webp.webpThumbnail) || !webp.hasAnimatedWebp;

  // when Preview-all is enabled and we need an HEVC proxy, register demand only while visible.
  useEffect(() => {
    if (isVideoMode) {
      reportProxyDemand(originalPath, null);
      return;
    }

    if (!gridPreview) {
      reportProxyDemand(originalPath, null);
      return;
    }

    // gated on decodability, not on the transcode preference: this queue exists
    // so an unplayable source can be previewed at all. Using the preference here
    // would queue source-video encodes in WebP mode, which never plays video.
    const wantsProxyNow =
      needsHevcProxy &&
      isVisible &&
      effectiveSrc === originalPath; // still on original => proxy not yet applied

    if (wantsProxyNow) {
      reportProxyDemand(originalPath, { order: index, priority: isHovered });
    } else {
      reportProxyDemand(originalPath, null);
    }
  }, [gridPreview, isVideoMode, needsHevcProxy, isVisible, effectiveSrc, originalPath, index, isHovered, reportProxyDemand]);

  // reset state when clip/import/audio-stream changes
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.muted = true;
      try {
        v.currentTime = 0;
      } catch {
        // ignore
      }
    }

    hasReportedErrorRef.current = false;
    hasFirstFrameRef.current = false;
    proxyInFlightRef.current = false;
    mergedPreviewInFlightRef.current = false;
    mergedPreviewFetchedKeyRef.current = null;
    setMergedPreviewSrc(null);
    setMergedPreviewFailed(false);

    const callbackVideo = videoRef.current;
    if (callbackVideo && videoFrameCallbackIdRef.current && (callbackVideo as any).cancelVideoFrameCallback) {
      try {
        (callbackVideo as any).cancelVideoFrameCallback(videoFrameCallbackIdRef.current);
      } catch {
        // ignore
      }
    }
    videoFrameCallbackIdRef.current = null;
    staggerDoneRef.current = false;
    setStaggerReady(false);
    setForceThumbnail(false);
    setIsVideoReady(false);
    setEffectiveSrc(clip.src);
    setVideoProxy(null);
    setVideoThumbFailed(false);
    setVideoThumbRetry(0);
  }, [clip.src, importToken, previewAudioStreamIndex]);

  // a tile needs a proxy when its codec can't be decoded here, or when a
  // non-default preview language has to be remuxed in. one call covers both so
  // a tile never builds two files.
  useEffect(() => {
    if (!isVideoMode || !clip.clipPath || !videoProxyKey) return;
    if (videoProxySrc) return;

    const wantsAudioMapped = proxyAudioStreamIndex !== null && isHovered;
    if (!needsPreviewTranscode && !wantsAudioMapped) return;
    // mirrors shouldMountVideo: only encode for a tile about to play. keying this
    // off visibility queued an encode per on-screen tile and froze the app.
    if (!isHovered && !(gridPreview && staggerReady)) return;

    const requestedKey = videoProxyKey;
    let cancelled = false;
    invoke<string>("ensure_preview_proxy", {
      clipPath: clip.clipPath,
      audioStreamIndex: proxyAudioStreamIndex,
      transcodeVideo: needsPreviewTranscode,
      previewHeight: transcodePreset.height,
      previewCrf: transcodePreset.crf,
    })
      .then((path) => {
        if (!cancelled && path) setVideoProxy({ key: requestedKey, path });
      })
      .catch((err) => { console.warn("video preview proxy failed", err); });
    return () => { cancelled = true; };
  }, [
    isVideoMode,
    clip.clipPath,
    videoProxyKey,
    videoProxySrc,
    proxyAudioStreamIndex,
    needsPreviewTranscode,
    transcodePreset,
    isHovered,
    gridPreview,
    staggerReady,
  ]);

  const ensurePreviewProxyPath = useCallback(
    async (clipPath: string, priority: boolean, transcodeVideo: boolean): Promise<string> => {
      if (selectedMappedAudioStreamIndex === null) {
        return gridPreview
          ? requestProxySequential(clipPath, priority)
          : invoke<string>("ensure_preview_proxy", {
              clipPath,
              transcodeVideo,
              previewHeight: transcodePreset.height,
              previewCrf: transcodePreset.crf,
            });
      }

      return invoke<string>("ensure_preview_proxy", {
        clipPath,
        transcodeVideo,
        audioStreamIndex: selectedMappedAudioStreamIndex,
        previewHeight: transcodePreset.height,
        previewCrf: transcodePreset.crf,
      });
    },
    [gridPreview, requestProxySequential, selectedMappedAudioStreamIndex, transcodePreset]
  );

  // proactive HEVC/audio-stream proxy gating:
  // - HEVC without support always needs proxy.
  // - Hover audio with a non-default stream needs a mapped proxy.
  useEffect(() => {
    // video mode has its own proxy effect above (it proxies the cut clip, not
    // the source video), so this path is WebP mode only.
    if (isVideoMode) return;

    const needsAudioMappedProxy =
      selectedMappedAudioStreamIndex !== null &&
      isHovered &&
      audioPlaybackHover;
    const shouldTranscodeVideo = needsPreviewTranscode;
    const needsPreviewProxy = shouldTranscodeVideo || needsAudioMappedProxy;

    if (!needsPreviewProxy) return;
    if (!isVisible) return;
    if (!showVideo) return;

    const clipPath = originalPath;
    if (!clipPath || clipPath === "") return;

    const run = async () => {
      try {
        if (proxyInFlightRef.current) return;
        if (effectiveSrc !== originalPath) return; // already proxy

        proxyInFlightRef.current = true;
        setForceThumbnail(true);

        const proxyPath = await ensurePreviewProxyPath(clipPath, /* priority */ isHovered, shouldTranscodeVideo);

        if (originalPath !== clipPath) return;

        if (proxyPath) {
          setEffectiveSrc(proxyPath);
          setForceThumbnail(false);

          setTimeout(() => {
            const vid = videoRef.current;
            if (!vid) return;
            vid.load();
            vid.play().catch(() => { });
          }, 0);
        } else {
          setForceThumbnail(true);
        }
      } catch (err) {
        console.warn("ensure_preview_proxy failed", err);
        setForceThumbnail(true);
      } finally {
        proxyInFlightRef.current = false;
      }
    };

    void run();
  }, [
    isVideoMode,
    needsPreviewTranscode,
    selectedMappedAudioStreamIndex,
    audioPlaybackHover,
    isVisible,
    isHovered,
    showVideo,
    effectiveSrc,
    originalPath,
    ensurePreviewProxyPath,
  ]);

  // generate a stream-copy concat preview for merged clips (skipped for HEVC — proxy handles that).
  useEffect(() => {
    if (!mergedSrcsKey || !clip.mergedSrcs) return;
    if (needsHevcProxy) return;
    if (!isVisible) return;
    if (mergedPreviewFetchedKeyRef.current === mergedSrcsKey) return;
    if (mergedPreviewInFlightRef.current) return;

    mergedPreviewFetchedKeyRef.current = mergedSrcsKey;
    mergedPreviewInFlightRef.current = true;
    setMergedPreviewFailed(false);

    invoke<string>("ensure_merged_preview", {
      srcs: clip.mergedSrcs,
      audioStreamIndex: previewAudioStreamIndex ?? undefined,
    })
      .then((path) => {
        if (!path) {
          setMergedPreviewFailed(true);
          return;
        }
        setMergedPreviewSrc(path);
        setEffectiveSrc(path);
      })
      .catch((err) => {
        console.warn("ensure_merged_preview failed", err);
        setMergedPreviewFailed(true);
        mergedPreviewFetchedKeyRef.current = null; // allow retry
      })
      .finally(() => {
        mergedPreviewInFlightRef.current = false;
      });
  }, [mergedSrcsKey, needsHevcProxy, isVisible, clip.mergedSrcs, previewAudioStreamIndex]);

  // stagger queue: report demand when grid-preview is on and tile is visible.
  // same pattern as the proxy queue - register/unregister, central loop picks
  // the best candidate and calls onReady.  Hover bypasses the queue.
  useEffect(() => {
    if (!gridPreview) {
      reportStaggerDemand(clip.id, null);
      return;
    }

    // hover bypasses the stagger queue - instant playback for the hovered tile.
    if (isHovered) {
      staggerDoneRef.current = true;
      setStaggerReady(true);
      reportStaggerDemand(clip.id, null);
      return;
    }

    // tile scrolled out - reset and unregister.
    if (!isVisible) {
      staggerDoneRef.current = false;
      setStaggerReady(false);
      reportStaggerDemand(clip.id, null);
      return;
    }

    // already stagger-mounted and still visible; don't re-queue.
    if (staggerDoneRef.current) {
      setStaggerReady(true);
      reportStaggerDemand(clip.id, null);
      return;
    }

    // HEVC proxy clips are already serialised by the proxy queue.
    if (needsHevcProxy) {
      setStaggerReady(true);
      reportStaggerDemand(clip.id, null);
      return;
    }

    // register demand - the central queue will call onReady when it's our turn.
    reportStaggerDemand(clip.id, {
      order: index,
      onReady: () => {
        staggerDoneRef.current = true;
        setStaggerReady(true);
      },
    });

    return () => {
      reportStaggerDemand(clip.id, null);
    };
  }, [gridPreview, isHovered, isVisible, needsHevcProxy, clip.id, index, reportStaggerDemand]);

  const requestFirstFrame = useCallback((video: HTMLVideoElement) => {
    if (hasFirstFrameRef.current) return;
    if (!(video as any).requestVideoFrameCallback) return;
    if (videoFrameCallbackIdRef.current) return;

    try {
      videoFrameCallbackIdRef.current = (video as any).requestVideoFrameCallback(() => {
        hasFirstFrameRef.current = true;
        videoFrameCallbackIdRef.current = null;
        setIsVideoReady(true);
      });
    } catch {
      // ignore
    }
  }, []);

  // if we swap sources (e.g., original -> proxy), allow the next onError to run
  // and re-arm thumbnail gating.
  useEffect(() => {
    hasReportedErrorRef.current = false;
    hasFirstFrameRef.current = false;
    setIsVideoReady(false);
  }, [effectiveSrc]);

  // refine visibility for demand-prioritization / video playback. The grid is
  // already virtualized (only near-viewport rows are mounted), so this no longer
  // gates whether the tile renders its thumbnail — it only distinguishes truly
  // on-screen tiles from the overscan rows. Scoped to the scroll container (not
  // the document viewport) so it stays accurate regardless of outer layout.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const root = el.closest(".clips-container") as HTMLElement | null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const rect = entry.boundingClientRect;
        // A 0x0 rect means an ancestor went display:none (e.g. the user switched
        // to Settings), not a real scroll-off. Ignore it so we don't tear down
        // this tile's visibility/playback — returning to the page stays instant.
        if (rect.width === 0 && rect.height === 0) return;
        setIsVisible(entry.isIntersecting);
      },
      { root, rootMargin: "300px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // media player release. React removing a <video> from the DOM does NOT free
  // chromium's decoder/demuxer until GC. Hover + scroll churn (each mounts a
  // fresh <video>) accumulates zombie players until the per-renderer cap, after
  // which every new video fails with MEDIA_ERR_SRC_NOT_SUPPORTED (code 4) and
  // the whole app lags. Clearing src + load() in the cleanup releases the player
  // synchronously. The setup phase restores a stripped src attribute: StrictMode
  // re-runs cleanup+setup on the SAME element, and React won't re-apply a src
  // prop it considers unchanged — without the restore, dev hover playback dies.
  // declared BEFORE the playback effect so on re-runs the src is back in place
  // by the time playback calls load()/play().
  useEffect(() => {
    if (!shouldMountVideo) return;
    // capture the element now: by the time the cleanup runs on unmount, React
    // has already nulled videoRef.current (refs detach before passive cleanup).
    // releasing a detached element still frees its media player.
    const v = videoRef.current;
    if (!v) return;
    if (videoSrcUrl && v.getAttribute("src") !== videoSrcUrl) {
      v.setAttribute("src", videoSrcUrl);
      try {
        v.load();
      } catch {
        // ignore
      }
    }
    return () => {
      if (videoFrameCallbackIdRef.current && (v as any).cancelVideoFrameCallback) {
        try {
          (v as any).cancelVideoFrameCallback(videoFrameCallbackIdRef.current);
        } catch {
          // ignore
        }
        videoFrameCallbackIdRef.current = null;
      }
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {
        // ignore
      }
    };
  }, [shouldMountVideo, videoSrcUrl]);

  // playback control:
  // - When hovered (or grid preview mode) AND the video is mounted, ensure it loads and plays.
  // - When not hovered, pause and rewind to 0 so hover-preview always starts at the beginning.
  // we intentionally keep this separate from the proxy queue; it applies to all non-proxy playback too.

  // control playback: play when hovered/preview, pause and rewind otherwise
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // video mode: always mounted when visible (for the first-frame poster), but
    // only plays on hover, or in preview-all once the stagger queue reaches this
    // tile — so preview-all lights up top-left → bottom-right, not all at once.
    const shouldPlay = isVideoMode
      ? (isHovered || (gridPreview && staggerReady))
      : (showVideo && shouldMountVideo);
    if (shouldPlay) {
      // audio logic: only play audio if hovered AND setting is enabled.
      // grid preview (Preview-all) should remain muted unless specifically hovered.
      const audioEnabled = isHovered && audioPlaybackHover;
      v.muted = !audioEnabled;
      v.volume = playbackVolume;

      v.autoplay = true;
      v.loop = true;
      v.playbackRate = Math.max(0.25, Math.min(3, gridPreviewSpeed));

      if (v.readyState === 0) {
        try {
          v.load();
        } catch {
          // ignore
        }
      }
      v.play().catch(() => { });
    } else {
      v.pause();
      v.muted = true;
      try {
        v.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }, [isVideoMode, gridPreview, staggerReady, showVideo, shouldMountVideo, effectiveSrc, isHovered, audioPlaybackHover, playbackVolume, gridPreviewSpeed]);

  // some HEVC variants (e.g. yuv444p10) can appear "supported" but stall/black-screen in HTML video.
  // if no frame becomes ready shortly after playback starts, force a proxy fallback.
  useEffect(() => {
    if (isVideoMode) return; // clip files are pre-cut H.264, never need HEVC fallback
    if (!showVideo || !shouldMountVideo) return;
    if (videoIsHEVC !== true) return;
    if (effectiveSrc !== originalPath) return;

    const timeout = window.setTimeout(async () => {
      const v = videoRef.current;
      if (!v) return;
      if (proxyInFlightRef.current) return;
      if (effectiveSrc !== originalPath) return;

      if (hasFirstFrameRef.current || v.readyState >= 2) {
        return;
      }

      try {
        proxyInFlightRef.current = true;
        setForceThumbnail(true);

        const proxyPath = await ensurePreviewProxyPath(originalPath, isHovered, true);

        if (!proxyPath) return;

        setEffectiveSrc(proxyPath);
        setForceThumbnail(false);

        setTimeout(() => {
          const vid = videoRef.current;
          if (!vid) return;
          vid.load();
          vid.play().catch(() => { });
        }, 0);
      } catch {
        setForceThumbnail(true);
      } finally {
        proxyInFlightRef.current = false;
      }
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    isVideoMode,
    showVideo,
    shouldMountVideo,
    videoIsHEVC,
    effectiveSrc,
    originalPath,
    gridPreview,
    isHovered,
    requestProxySequential,
    ensurePreviewProxyPath,
  ]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (clip.thumbnailReady === false) return; // still generating — block
      onClipClick(clip.id, clip.src, index, e);
    },
    [clip.id, clip.src, clip.thumbnailReady, index, onClipClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (clip.thumbnailReady === false) return; // still generating — block
      onClipDoubleClick(clip.id, clip.src, index, e);
    },
    [clip.id, clip.src, clip.thumbnailReady, index, onClipDoubleClick]
  );


  // register video element ref for parent access
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
  }, []);

  const updateDownloadToneFromThumbnail = useCallback((img: HTMLImageElement | null) => {
    if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return;

    // getImageData forces a synchronous decode + pixel readback; defer it to idle
    // time (coalescing any prior pending sample) so it never lands on a scroll
    // frame. Re-check the image inside the callback in case the tile changed.
    if (downloadToneIdleRef.current !== null) {
      cancelIdle(downloadToneIdleRef.current);
    }
    downloadToneIdleRef.current = scheduleIdle(() => {
      downloadToneIdleRef.current = null;
      if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return;
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        // sample the icon zone (top-right) to choose dark/light icon color.
        const targetSize = DOWNLOAD_TONE_SAMPLE_SIZE;
        const sourceW = Math.min(DOWNLOAD_TONE_SOURCE_SIZE, img.naturalWidth);
        const sourceH = Math.min(DOWNLOAD_TONE_SOURCE_SIZE, img.naturalHeight);
        const margin = DOWNLOAD_TONE_SAMPLE_MARGIN;

        const sx = Math.max(0, img.naturalWidth - sourceW - margin);
        const sy = Math.max(0, margin);

        canvas.width = targetSize;
        canvas.height = targetSize;

        ctx.drawImage(
          img,
          sx,
          sy,
          sourceW,
          sourceH,
          0,
          0,
          targetSize,
          targetSize
        );

        const data = ctx.getImageData(0, 0, targetSize, targetSize).data;
        let luminanceSum = 0;
        let alphaSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3] / 255;
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          luminanceSum += luminance * a;
          alphaSum += a;
        }

        const avgLuminance = alphaSum > 0 ? luminanceSum / alphaSum : 128;
        setDownloadTone(avgLuminance >= DOWNLOAD_TONE_THRESHOLD ? "dark" : "light");
      } catch {
        // keep previous tone if sampling fails.
      }
    });
  }, []);

  // cancel any pending tone sample when the tile unmounts.
  useEffect(() => {
    return () => {
      if (downloadToneIdleRef.current !== null) cancelIdle(downloadToneIdleRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showDownloadButton) return;
    const img = thumbnailRef.current;
    if (!img) return;
    if (!img.complete) return;
    updateDownloadToneFromThumbnail(img);
  }, [webp.displayThumbnailPath, importToken, showDownloadButton, updateDownloadToneFromThumbnail]);

  // A cached image can finish loading before React attaches its onLoad handler,
  // so the load event never fires. This is common after scrolling the whole grid
  // once (every WebP is now in the browser cache) and would otherwise leave the
  // skeleton overlay stuck up forever. Detect the already-complete case the moment
  // the <img> ref attaches and clear the loading state directly.
  const setThumbnailEl = useCallback((el: HTMLImageElement | null) => {
    thumbnailRef.current = el;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) {
      webp.setThumbnailLoaded(true);
      if (showDownloadButton) updateDownloadToneFromThumbnail(el);
    }
  }, [webp.setThumbnailLoaded, showDownloadButton, updateDownloadToneFromThumbnail]);

  const showTileLoadingOverlay = isVideoMode
    ? (clip.thumbnailReady === false || videoThumbFailed)
    : (clip.thumbnailReady === false || !webp.thumbnailLoaded || webp.thumbnailFailed);

  return (
    <div
      ref={wrapperRef}
      className={`clip-wrapper ${isFocused ? "focused" : ""} ${isSelected ? "selected" : ""} ${dragOver ? "scenepack-drag-over" : ""} ${appearDelayMs !== null ? "clip-appear" : ""}`}
      style={appearDelayMs !== null ? { ["--appear-delay" as any]: `${appearDelayMs}ms` } : undefined}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onClipContextMenu?.(e, clip)}
      draggable={activePage === "scenepacks"}
      onDragStart={(e) => {
        if (activePage !== "scenepacks") return;
        e.dataTransfer.setData("text/plain", String(clip.sceneIndex ?? index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (activePage !== "scenepacks") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (activePage !== "scenepacks") return;
        e.preventDefault();
        setDragOver(false);
        const fromIdx = Number(e.dataTransfer.getData("text/plain"));
        const toIdx = clip.sceneIndex ?? index;
        if (Number.isNaN(fromIdx) || fromIdx === toIdx) return;
        const spId = useScenepacksStore.getState().openedScenepackId;
        if (spId) {
          useScenepacksStore.getState().reorderScenepackClips(spId, fromIdx, toIdx);
        }
      }}
      onDragEnd={() => setDragOver(false)}
      // hover toggles isHovered, which controls whether the <video> mounts and whether playback starts.
      onMouseEnter={() => {
        // IntersectionObserver can lag by a tick; hovering should always mount/play immediately.
        setIsVisible(true);
        setIsHovered(true);
        // A tile whose poster gave up gets another chance on interaction.
        if (videoThumbFailed) {
          setVideoThumbFailed(false);
          setVideoThumbRetry(0);
        }
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        // clear transient error/thumbnail flags so a later hover can try again.
        hasReportedErrorRef.current = false;
        setForceThumbnail(false);
        setIsVideoReady(false);
      }}
    >
      <button
        className={`clip-selected ${isSelected ? "active" : ""}`}
        onClick={(e) => onToggleSelection(clip.id, e)}
        title={isSelected ? "Deselect clip" : "Select clip"}
      >
        {isSelected ? <FaCheck /> : <FaPlus />}
      </button>

      {/* Content renders for every windowed tile — the virtualizer already limits
          mounting to near-viewport rows, so we don't gate the thumbnail behind the
          IntersectionObserver (which could leave on-screen tiles blank until hover). */}
      {videoClipPending ? (
        <div className="clip clip-skeleton" style={{ borderRadius: 15 }} />
      ) : (
        <>
          {/* ===================== WEBP layer: static thumbnail =====================
              Rendered in WebP mode only; video mode uses the <video> for the poster. */}
          {!isVideoMode && !webp.thumbnailFailed && clip.thumbnailReady !== false
            && (webpStaticReady || isVisible) && (
            <img
              ref={setThumbnailEl}
              className="clip"
              src={
                webp.webpThumbnail
                ?? (webp.hasAnimatedWebp
                  ? `${convertFileSrc(previewWebpPath!)}?v=${importToken}`
                  : `${convertFileSrc(webp.thumbnailSrc)}?v=${importToken}`)
              }
              style={{ opacity: shouldShowThumbnail ? 1 : 0 }}
              draggable={false}
              onLoad={(e) => {
                webp.setThumbnailLoaded(true);
                if (showDownloadButton) {
                  updateDownloadToneFromThumbnail(e.currentTarget);
                }
              }}
              onError={webp.handleThumbnailError}
              onDragStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          )}

          {/* ===================== VIDEO layer: static jpg poster =====================
              Video mode shows a still image at rest (production parity); the <video>
              below mounts only on hover / preview-all. */}
          {isVideoMode && clip.thumbnailReady !== false && !videoThumbFailed && (
            <img
              className="clip"
              src={`${convertFileSrc(clip.thumbnail)}?v=${importToken}${videoThumbRetry > 0 ? `&r=${videoThumbRetry}` : ""}`}
              style={{ opacity: shouldShowThumbnail ? 1 : 0 }}
              draggable={false}
              onError={() => {
                // retry with a fresh cache-buster before giving up — poster jpgs
                // occasionally fail transiently when the whole grid (re)loads.
                setVideoThumbRetry((attempt) => {
                  if (attempt >= VIDEO_THUMB_MAX_RETRIES) {
                    setVideoThumbFailed(true);
                    return attempt;
                  }
                  return attempt + 1;
                });
              }}
              onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            />
          )}

          {/* SHARED layer: skeleton shown until the thumbnail/video is ready */}
          {showTileLoadingOverlay && (
            <div
              className="clip clip-skeleton clip-thumb-loading-overlay"
              style={{ opacity: shouldShowThumbnail ? 1 : 0 }}
            />
          )}
          {/* ===================== VIDEO layer: cut clip playback =====================
              In video mode: mounted when visible/hovered to show the first frame.
              In WebP mode: intentionally disabled (showVideo=false → shouldMountVideo=false). */}
          {shouldMountVideo && videoSrcUrl && (
            <video
              className="clip"
              src={videoSrcUrl}
              muted={!(isHovered && audioPlaybackHover)}
              loop
              autoPlay
              playsInline
              preload="none"
              ref={setVideoRef}
              style={{ position: "absolute", inset: 0 }}
              draggable={false}
              onDragStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onLoadedMetadata={(e) => {
                if (gridPreview || isHovered) {
                  const audioEnabled = isHovered && audioPlaybackHover;
                  e.currentTarget.muted = !audioEnabled;
                  e.currentTarget.volume = playbackVolume;
                  e.currentTarget.play().catch(() => { });
                }
              }}
              onPlaying={(e) => {
                requestFirstFrame(e.currentTarget);
              }}
              onLoadedData={() => {
                hasFirstFrameRef.current = true;
                setIsVideoReady(true);
              }}
              onError={(e) => {
                if (hasReportedErrorRef.current) return;
                hasReportedErrorRef.current = true;

                if (effectiveSrc !== originalPath) {
                  setForceThumbnail(true);
                  return;
                }

                setForceThumbnail(true);

                const v = e.currentTarget;
                const errorCode = v.error?.code ?? null;
                if (import.meta.env.DEV) console.log(`Error on video -> CODE: ${errorCode}`);

                invoke("hover_preview_error", {
                  clipId: clip.id,
                  clipPath: isVideoMode ? (clip.clipPath ?? originalPath) : originalPath,
                  errorCode,
                }).catch(() => { });

                // video mode plays the pre-cut H.264 clip file directly; the HEVC
                // source-proxy fallback below would transcode the WRONG file (the
                // full source episode) and set effectiveSrc, which video-mode src
                // ignores — pure wasted ffmpeg work. Retry the clip itself once
                // instead: transient decoder/IO hiccups recover on a fresh load.
                if (isVideoMode) {
                  const vid = videoRef.current;
                  window.setTimeout(() => {
                    if (!vid || !vid.isConnected) return;
                    hasReportedErrorRef.current = false;
                    try {
                      vid.load();
                      vid.play().catch(() => { });
                    } catch {
                      // ignore
                    }
                  }, 300);
                  return;
                }

                if (proxyInFlightRef.current) return;
                proxyInFlightRef.current = true;

                const clipPath = originalPath;
                (async () => {
                  try {
                    const proxyPath = await ensurePreviewProxyPath(clipPath, true, true);

                    if (originalPath !== clipPath) return;
                    if (!proxyPath) {
                      setForceThumbnail(true);
                      return;
                    }

                    setEffectiveSrc(proxyPath);
                    setForceThumbnail(false);

                    setTimeout(() => {
                      const vid = videoRef.current;
                      if (!vid) return;

                      const audioEnabled = isHovered && audioPlaybackHover;
                      vid.muted = !audioEnabled;
                      vid.volume = playbackVolume;

                      vid.load();
                      vid.play().catch(() => { });
                    }, 0);
                  } catch {
                    setForceThumbnail(true);
                  } finally {
                    proxyInFlightRef.current = false;
                  }
                })();
              }}
            />
          )}

          {/* WEBP layer: animated preview, shown over the static thumbnail on hover/preview-all */}
          {shouldShowWebpOverlay && previewWebpPath && (
            <img
              className="clip"
              style={{ position: "absolute", inset: 0, objectFit: "cover", zIndex: 3 }}
              src={`${convertFileSrc(previewWebpPath)}?v=${importToken}`}
              draggable={false}
              onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            />
          )}

          {/* SHARED layer: status / timestamp / download chrome */}
          {isProcessing && (
            <div className="clip-status-overlay">
              <span className="status-text">{clip.originalName}</span>
            </div>
          )}

          {showClipTimestamps && clip.startSec !== undefined && (
            <div className="clip-original-timestamp">
              {formatClipTime(clip.startSec)}
            </div>
          )}

          {showDownloadButton && (
            <DownloadButton tone={downloadTone} onClick={() => onDownloadClip(clip)} />
          )}

          {activePage === "home" && scenepacksEnabled && (
            <button
              className="clip-add-to-scenepack"
              onClick={(e) => {
                e.stopPropagation();
                setShowScenepackModal(true);
              }}
              title="Add to Scenepack"
            >
              <FaLayerGroup />
            </button>
          )}

          {activePage === "scenepacks" && (
            <button
              className="clip-remove-from-scenepack"
              onClick={(e) => {
                e.stopPropagation();
                const spId = useScenepacksStore.getState().openedScenepackId;
                if (!spId) return;
                // Same path as the right-click menu, so store removal and file
                // cleanup stay in one place.
                void removeClipsFromScenepack(spId, [
                  { index: clip.sceneIndex ?? 0, clipPath: clip.clipPath },
                ]);
              }}
              title="Remove from Scenepack"
            >
              <FaTrashAlt />
            </button>
          )}

          {showScenepackModal && (
            <AddToScenepackModal
              clip={clip}
              episodeId={episodeId}
              onClose={() => setShowScenepackModal(false)}
            />
          )}
        </>
      )}
    </div>
  );
});
