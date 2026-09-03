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
};

function restartPlayback(videoRef: RefObject<HTMLVideoElement | null>) {
  setTimeout(() => {
    const v = videoRef.current;
    if (!v) return;
    v.load();
    v.play().catch(() => {});
  }, 0);
}

// owns which file the <video> actually plays: the raw source, an HEVC or
// audio-mapped proxy, or a concat preview for merged clips
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
}: Params) {
  const originalPath = clip.src;
  const [effectiveSrc, setEffectiveSrc] = useState(clip.src);
  const [videoProxy, setVideoProxy] = useState<{ key: string; path: string } | null>(null);

  // refs, not state: these guard against a second request starting in the same
  // tick, so the write has to land synchronously
  const proxyInFlightRef = useRef(false);
  const mergedInFlightRef = useRef(false);
  const mergedFetchedKeyRef = useRef<string | null>(null);

  const { needed: needsPreviewTranscode, preset: transcodePreset } = usePreviewTranscode();

  const selectedMappedAudioStreamIndex =
    previewAudioStreamIndex !== null && previewAudioStreamIndex > 0 ? previewAudioStreamIndex : null;

  // excludes isHovered so hovering does not rebuild the proxy
  const proxyAudioStreamIndex =
    selectedMappedAudioStreamIndex !== null && audioPlaybackHover ? selectedMappedAudioStreamIndex : null;

  // identifies exactly which proxy this tile wants, so a quality or language
  // change rebuilds it instead of reusing a stale file
  const videoProxyKey =
    isVideoMode && clip.clipPath
      ? `${clip.clipPath}::${proxyAudioStreamIndex ?? "na"}::${
          needsPreviewTranscode ? `x264_${transcodePreset.height}p${transcodePreset.crf}` : "copy"
        }`
      : null;
  const videoProxySrc = videoProxy && videoProxy.key === videoProxyKey ? videoProxy.path : null;

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

    // gated on decodability, not on the transcode preference: this queue exists so
    // an unplayable source can be previewed at all, and using the preference here
    // would queue encodes in WebP mode, which never plays video
    const wantsProxyNow = needsHevcProxy && isVisible && effectiveSrc === originalPath;
    if (wantsProxyNow) {
      reportProxyDemand(originalPath, { order: index, priority: isHovered });
    } else {
      clear();
    }

    // tiles unmount as they scroll out, so demand has to be withdrawn or the queue
    // keeps entries for tiles that are gone
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

  // video mode proxies the cut clip: one call covers both an undecodable codec and
  // a non-default preview language, so a tile never builds two files
  useEffect(() => {
    if (!isVideoMode || !clip.clipPath || !videoProxyKey) return;
    if (videoProxySrc) return;

    const wantsAudioMapped = proxyAudioStreamIndex !== null && isHovered;
    if (!needsPreviewTranscode && !wantsAudioMapped) return;
    // mirrors shouldMountVideo: keying this off visibility queued an encode per
    // on-screen tile and froze the app
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

  // stream-copy concat preview for merged clips, skipped for HEVC since the proxy
  // above already covers it
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
    needsPreviewTranscode,
    proxyInFlightRef,
    ensurePreviewProxyPath,
    restartPlayback: () => restartPlayback(videoRef),
  };
}
