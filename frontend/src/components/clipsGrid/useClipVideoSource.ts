import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ClipItem } from "../../types/domain";
import { LazyClipProps } from "./types.ts";
import { usePreviewTranscode } from "../../features/preview/usePreviewTranscode.ts";

type Params = {
  clip: ClipItem;
  index: number;
  isVideoMode: boolean;
  isVisible: boolean;
  isHovered: boolean;
  gridPreview: boolean;
  staggerReady: boolean;
  showVideo: boolean;
  importToken: unknown;
  needsHevcProxy: boolean;
  audioPlaybackHover: boolean;
  previewAudioStreamIndex: number | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  requestProxySequential: LazyClipProps["requestProxySequential"];
  reportProxyDemand: LazyClipProps["reportProxyDemand"];
  /** set for a tile that points into a full source video (scene scout) instead of a cut clip */
  rangeStart?: number;
  rangeEnd?: number;
};

function restartPlayback(videoRef: RefObject<HTMLVideoElement | null>) {
  setTimeout(() => {
    const v = videoRef.current;
    if (!v) return;
    v.load();
    v.play().catch(() => {});
  }, 0);
}

// which file the <video> plays: the source, an HEVC or audio-mapped proxy, or a merged-clip concat
export function useClipVideoSource({
  clip,
  index,
  isVideoMode,
  isVisible,
  isHovered,
  gridPreview,
  staggerReady,
  showVideo,
  importToken,
  needsHevcProxy,
  audioPlaybackHover,
  previewAudioStreamIndex,
  videoRef,
  requestProxySequential,
  reportProxyDemand,
  rangeStart,
  rangeEnd,
}: Params) {
  const originalPath = clip.src;
  const [effectiveSrc, setEffectiveSrc] = useState(clip.src);
  const [videoProxy, setVideoProxy] = useState<{ key: string; path: string } | null>(null);
  const [rangeProxy, setRangeProxy] = useState<{ key: string; path: string } | null>(null);
  const [rangeFailedKey, setRangeFailedKey] = useState<string | null>(null);
  // the source file itself is gone, so there is nothing to fall back to either
  const [sourceMissingKey, setSourceMissingKey] = useState<string | null>(null);

  // refs, not state, so a second request in the same tick sees the guard
  const proxyInFlightRef = useRef(false);
  const mergedInFlightRef = useRef(false);
  const mergedFetchedKeyRef = useRef<string | null>(null);

  const { needed: needsPreviewTranscode, preset: transcodePreset } = usePreviewTranscode();

  const selectedMappedAudioStreamIndex =
    previewAudioStreamIndex !== null && previewAudioStreamIndex > 0 ? previewAudioStreamIndex : null;

  // excludes isHovered so hovering does not rebuild the proxy
  const proxyAudioStreamIndex =
    selectedMappedAudioStreamIndex !== null && audioPlaybackHover ? selectedMappedAudioStreamIndex : null;

  // the exact proxy this tile wants, so a quality or language change rebuilds it
  const targetVideoPath = clip.clipPath ?? clip.src;
  const videoProxyKey =
    isVideoMode && targetVideoPath
      ? `${targetVideoPath}::${proxyAudioStreamIndex ?? "na"}::${
          needsPreviewTranscode ? `x264_${transcodePreset.height}p${transcodePreset.crf}` : "copy"
        }`
      : null;
  const videoProxySrc = videoProxy && videoProxy.key === videoProxyKey ? videoProxy.path : null;

  // a short x264 cut of just the scene, so a tile never decodes the whole source episode
  const rangeKey =
    isVideoMode && !clip.clipPath && clip.src && rangeStart !== undefined && rangeEnd !== undefined && rangeEnd > rangeStart
      ? `${clip.src}::${rangeStart}::${rangeEnd}::${transcodePreset.height}p${transcodePreset.crf}`
      : null;
  const rangeProxySrc = rangeProxy && rangeProxy.key === rangeKey ? rangeProxy.path : null;
  const rangeFailed = rangeKey !== null && rangeFailedKey === rangeKey;
  const sourceMissing = rangeKey !== null && sourceMissingKey === rangeKey;

  const mergedSrcsKey = clip.mergedSrcs
    ? `${clip.mergedSrcs.join("|")}::audio:${previewAudioStreamIndex ?? "default"}`
    : null;

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

  // reset when the clip, import, or audio stream changes
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.muted = true;
      try {
        v.currentTime = 0;
      } catch {}
    }
    proxyInFlightRef.current = false;
    mergedInFlightRef.current = false;
    mergedFetchedKeyRef.current = null;
    setEffectiveSrc(clip.src);
    setVideoProxy(null);
  }, [clip.src, importToken, previewAudioStreamIndex]);

  // demand registration for the shared HEVC proxy queue
  useEffect(() => {
    const clear = () => reportProxyDemand(originalPath, null);
    if (isVideoMode || !gridPreview) {
      clear();
      return;
    }

    // gated on decodability, not the transcode preference, or WebP mode would queue encodes it never plays
    const wantsProxyNow = needsHevcProxy && isVisible && effectiveSrc === originalPath;
    if (wantsProxyNow) {
      reportProxyDemand(originalPath, { order: index, priority: isHovered });
    } else {
      clear();
    }

    // withdrawn on unmount, or the queue keeps entries for tiles scrolled away
    return clear;
  }, [
    gridPreview,
    isVideoMode,
    needsHevcProxy,
    isVisible,
    effectiveSrc,
    originalPath,
    index,
    isHovered,
    reportProxyDemand,
  ]);

  // video mode proxies the cut clip once, covering both an undecodable codec and a non-default language
  useEffect(() => {
    if (!isVideoMode || !clip.clipPath || !videoProxyKey) return;
    if (videoProxySrc) return;

    const wantsAudioMapped = proxyAudioStreamIndex !== null && isHovered;
    if (!needsPreviewTranscode && !wantsAudioMapped) return;
    // mirrors shouldMountVideo; keying off visibility queued an encode per tile and froze the app
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
      .catch((err) => console.warn("video preview proxy failed", err));
    return () => {
      cancelled = true;
    };
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

  // same gate as the cut-clip proxy above: hover, or this tile's turn in preview-all
  useEffect(() => {
    if (!rangeKey || rangeProxySrc || rangeFailed) return;
    if (!isHovered && !(gridPreview && staggerReady)) return;

    const requestedKey = rangeKey;
    let cancelled = false;
    invoke<string>("ensure_scene_range_preview", {
      videoPath: clip.src,
      startSec: rangeStart,
      endSec: rangeEnd,
      previewHeight: transcodePreset.height,
      previewCrf: transcodePreset.crf,
    })
      .then((path) => {
        if (!cancelled && path) setRangeProxy({ key: requestedKey, path });
      })
      .catch((err) => {
        console.warn("scene range preview failed", err);
        if (cancelled) return;
        setRangeFailedKey(requestedKey);
        if (String(err).startsWith("Video not found")) setSourceMissingKey(requestedKey);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeKey, rangeProxySrc, rangeFailed, clip.src, rangeStart, rangeEnd, transcodePreset, isHovered, gridPreview, staggerReady]);

  // WebP mode proxies the source video instead
  useEffect(() => {
    if (isVideoMode) return;

    const needsAudioMappedProxy =
      selectedMappedAudioStreamIndex !== null && isHovered && audioPlaybackHover;
    if (!needsPreviewTranscode && !needsAudioMappedProxy) return;
    if (!isVisible || !showVideo || !originalPath) return;

    void (async () => {
      try {
        if (proxyInFlightRef.current) return;
        if (effectiveSrc !== originalPath) return;

        proxyInFlightRef.current = true;
        const proxyPath = await ensurePreviewProxyPath(originalPath, isHovered, needsPreviewTranscode);
        if (proxyPath) {
          setEffectiveSrc(proxyPath);
          restartPlayback(videoRef);
        }
      } catch (err) {
        console.warn("ensure_preview_proxy failed", err);
      } finally {
        proxyInFlightRef.current = false;
      }
    })();
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

  // stream-copy concat preview for merged clips (HEVC is covered by the proxy above)
  useEffect(() => {
    if (!mergedSrcsKey || !clip.mergedSrcs) return;
    if (needsHevcProxy || !isVisible) return;
    if (mergedFetchedKeyRef.current === mergedSrcsKey || mergedInFlightRef.current) return;

    mergedFetchedKeyRef.current = mergedSrcsKey;
    mergedInFlightRef.current = true;

    invoke<string>("ensure_merged_preview", {
      srcs: clip.mergedSrcs,
      audioStreamIndex: previewAudioStreamIndex ?? undefined,
    })
      .then((path) => {
        if (path) setEffectiveSrc(path);
      })
      .catch((err) => {
        console.warn("ensure_merged_preview failed", err);
        mergedFetchedKeyRef.current = null;
      })
      .finally(() => {
        mergedInFlightRef.current = false;
      });
  }, [mergedSrcsKey, needsHevcProxy, isVisible, clip.mergedSrcs, previewAudioStreamIndex]);

  return {
    originalPath,
    effectiveSrc,
    setEffectiveSrc,
    videoProxySrc,
    rangeProxySrc,
    rangeFailed,
    sourceMissing,
    needsPreviewTranscode,
    proxyInFlightRef,
    ensurePreviewProxyPath,
    restartPlayback: () => restartPlayback(videoRef),
  };
}
