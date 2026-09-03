import { memo, useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FaCheck, FaPlus, FaTrashAlt } from "react-icons/fa";
import { LazyClipProps } from "./types.ts";
import { DownloadButton } from "./DownloadButton.tsx";
import Tooltip from "../common/Tooltip.tsx";
import { useWebpPreview } from "./useWebpPreview.ts";
import { useClipStagger } from "./useClipStagger.ts";
import { useClipVideoSource } from "./useClipVideoSource.ts";
import { useClipVideoElement } from "./useClipVideoElement.ts";
import { useDownloadTone } from "./useDownloadTone.ts";
import { formatClipTime } from "./clipFormat.ts";
import { useAppStateStore } from "../../stores/appStore.ts";
import { selectOverlayOpen, useUIStateStore } from "../../stores/UIStore.ts";
import { useGeneralSettingsStore, useThemeSettingsStore } from "../../stores/settingsStore.ts";
import { useScenePreviewStore } from "../../stores/scenePreviewStore.ts";
import { useContextMenuStore } from "../../stores/contextMenuStore.ts";
import { AddToScenepackModal } from "./AddToScenepackModal.tsx";
import { ScenepackPickerMenu } from "./ScenepackPickerMenu.tsx";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore.ts";
import { useScenepacksStore } from "../../stores/scenepackStore.ts";
import { removeClipsFromScenepack } from "../../utils/scenepackStorage.ts";

const VIDEO_THUMB_MAX_RETRIES = 2;

// a single tile in the clips grid. playback, proxying, stagger and tone sampling
// each live in their own hook; this file owns tile state and layout
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
  const importToken = useAppStateStore((s) => s.importToken);
  const previewWebpPath = useScenePreviewStore((s) => s.animatedByClipId[clip.id]);
  const isSelected = useAppStateStore((s) => s.selectedClips.has(clip.id));
  const isFocused = useAppStateStore((s) => s.focusedClipId === clip.id);

  // previews stay down while the settings modal is up: no decoders, no proxies.
  // deferred so opening settings paints the modal first instead of unmounting
  // every decoder in the same commit
  const settingsOpen = useDeferredValue(useUIStateStore(selectOverlayOpen));
  const gridPreview = useUIStateStore((s) => s.gridPreview) && !settingsOpen;
  const activePage = useUIStateStore((s) => s.activePage);
  const videoIsHEVC = useAppStateStore((s) => s.videoIsHEVC);
  const userHasHEVC = useAppStateStore((s) => s.userHasHEVC);
  const audioPlaybackHover = useGeneralSettingsStore((s) => s.audioPlaybackHover);
  const previewAudioStreamIndex = useGeneralSettingsStore((s) => s.previewAudioStreamIndex);
  const playbackVolume = useGeneralSettingsStore((s) => s.playbackVolume);
  const scenepacksEnabled = useGeneralSettingsStore((s) => s.scenepacksEnabled);
  const gridPreviewSpeed = useThemeSettingsStore((s) => s.gridPreviewSpeed ?? 1);
  const showDownloadButton = useThemeSettingsStore((s) => s.showDownloadButton);
  const showClipTimestamps = useThemeSettingsStore((s) => s.showClipTimestamps);

  const openedEpisodeId = useEpisodePanelRuntimeStore((s) => s.openedEpisodeId);
  const episodeId = clip.episodeId ?? openedEpisodeId ?? clip.id.split("_").slice(0, -1).join("_");

  const [isVisible, setIsVisible] = useState(false);
  // a tile hovered when the modal opened never gets its mouseleave
  const [hovered, setIsHovered] = useState(false);
  const isHovered = hovered && !settingsOpen;
  const [showScenepackModal, setShowScenepackModal] = useState(false);
  // where the tile's scenepack picker opened, or null when it is closed
  const [scenepackMenu, setScenepackMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [videoThumbFailed, setVideoThumbFailed] = useState(false);
  const [videoThumbRetry, setVideoThumbRetry] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // another menu claimed the slot, so this tile's menu is stale. without this a
  // right-click in a side panel left the clip menu hanging open beside it
  const activeContextMenu = useContextMenuStore((s) => s.activeMenu);
  useEffect(() => {
    if (activeContextMenu !== "clip-scenepack-picker") setScenepackMenu(null);
  }, [activeContextMenu]);

  const isVideoMode = Boolean(clip.clipPath) && clip.clipMode !== "failed";
  const isProcessing =
    clip.originalName === "Merging..." ||
    clip.originalName === "Splitting..." ||
    clip.originalName === "Adding...";
  const needsHevcProxy = videoIsHEVC === true && userHasHEVC === false;
  const resetKey = `${clip.src}::${importToken}::${previewAudioStreamIndex ?? "default"}`;

  useEffect(() => {
    setVideoThumbFailed(false);
    setVideoThumbRetry(0);
  }, [resetKey]);

  const staggerReady = useClipStagger({
    clipId: clip.id,
    index,
    gridPreview,
    isHovered,
    isVisible,
    needsHevcProxy,
    resetKey,
    reportStaggerDemand,
  });

  const source = useClipVideoSource({
    clip,
    index,
    isVideoMode,
    isVisible,
    isHovered,
    gridPreview,
    staggerReady,
    showVideo: isVideoMode,
    importToken,
    needsHevcProxy,
    audioPlaybackHover,
    previewAudioStreamIndex,
    videoRef,
    requestProxySequential,
    reportProxyDemand,
  });

  // mount on hover or preview-all only, never per visible tile, so the number of
  // live decoders stays bounded. when a transcode is needed, wait for the proxy
  // too or the raw clip renders black until ffmpeg finishes
  const shouldMountVideo =
    isVideoMode &&
    (isHovered || (gridPreview && staggerReady)) &&
    (!source.needsPreviewTranscode || Boolean(source.videoProxySrc));

  // single source of truth for the <video> src: the JSX and the media-release
  // effect must agree on it so a stripped attribute can be restored
  const videoSrcUrl = shouldMountVideo
    ? `${convertFileSrc(source.videoProxySrc ?? clip.clipPath!)}?v=${importToken}`
    : null;

  const video = useClipVideoElement({
    clip,
    isVideoMode,
    isHovered,
    gridPreview,
    staggerReady,
    showVideo: isVideoMode,
    shouldMountVideo,
    videoSrcUrl,
    effectiveSrc: source.effectiveSrc,
    originalPath: source.originalPath,
    videoIsHEVC,
    audioPlaybackHover,
    playbackVolume,
    gridPreviewSpeed,
    resetKey,
    videoRef,
    setEffectiveSrc: source.setEffectiveSrc,
    ensurePreviewProxyPath: source.ensurePreviewProxyPath,
    proxyInFlightRef: source.proxyInFlightRef,
    restartPlayback: source.restartPlayback,
  });

  const { tone: downloadTone, sample: sampleDownloadTone } = useDownloadTone();

  // all thumbnail and animated-WebP state lives in this hook
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

  // selecting WebP mode force-enables preview-all, so without the isVisible gate
  // every clip in the episode animates at once and kills the WebView2 renderer
  const shouldShowWebpOverlay = webp.hasAnimatedWebp && (isHovered || (gridPreview && isVisible));
  // the static layer falls back to the animated file until the extracted JPEG
  // exists, which is only safe near the viewport for the same reason
  const webpStaticReady = Boolean(webp.webpThumbnail) || !webp.hasAnimatedWebp;

  const shouldShowThumbnail = !shouldMountVideo || !video.isVideoReady;
  // in video-preview mode a clip that has not been cut yet (and has not failed)
  // shows a skeleton until its video arrives on the clip_ready stream
  const videoClipPending = videoPreviewMode && !isVideoMode && clip.clipMode !== "failed";
  const showTileLoadingOverlay = isVideoMode
    ? clip.thumbnailReady === false || videoThumbFailed
    : clip.thumbnailReady === false || !webp.thumbnailLoaded || webp.thumbnailFailed;

  // the grid is virtualized already, so this only separates truly on-screen tiles
  // from the overscan rows. scoped to the scroll container so it stays accurate
  // regardless of outer layout
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const root = el.closest(".clips-container") as HTMLElement | null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // a 0x0 rect means an ancestor went display:none (the user switched to
        // Settings), not a real scroll-off. ignoring it keeps the return instant
        const rect = entry.boundingClientRect;
        if (rect.width === 0 && rect.height === 0) return;
        setIsVisible(entry.isIntersecting);
      },
      { root, rootMargin: "300px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!showDownloadButton) return;
    const img = thumbnailRef.current;
    if (img?.complete) sampleDownloadTone(img);
  }, [webp.displayThumbnailPath, importToken, showDownloadButton, sampleDownloadTone]);

  // a cached image can finish loading before React attaches onLoad, so the event
  // never fires and the skeleton stays up forever. catch the already-complete
  // case the moment the ref attaches
  const setThumbnailEl = useCallback(
    (el: HTMLImageElement | null) => {
      thumbnailRef.current = el;
      if (!el) return;
      if (el.complete && el.naturalWidth > 0) {
        webp.setThumbnailLoaded(true);
        if (showDownloadButton) sampleDownloadTone(el);
      }
    },
    [webp.setThumbnailLoaded, showDownloadButton, sampleDownloadTone]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (clip.thumbnailReady === false) return;
      onClipClick(clip.id, clip.src, index, e);
    },
    [clip.id, clip.src, clip.thumbnailReady, index, onClipClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (clip.thumbnailReady === false) return;
      onClipDoubleClick(clip.id, clip.src, index, e);
    },
    [clip.id, clip.src, clip.thumbnailReady, index, onClipDoubleClick]
  );

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    // adding to a pack is a right-click now; the Scenepacks page keeps its own
    // menu, which ClipsContainer owns
    if (activePage === "home" && scenepacksEnabled) {
      e.preventDefault();
      e.stopPropagation();
      useContextMenuStore.getState().openContextMenu("clip-scenepack-picker");
      setScenepackMenu({ x: e.clientX, y: e.clientY });
      return;
    }
    onClipContextMenu?.(e, clip);
  };

  const stopDrag = (e: React.DragEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={wrapperRef}
      className={`clip-wrapper ${isFocused ? "focused" : ""} ${isSelected ? "selected" : ""} ${dragOver ? "scenepack-drag-over" : ""} ${appearDelayMs !== null ? "clip-appear" : ""}`}
      style={appearDelayMs !== null ? { ["--appear-delay" as any]: `${appearDelayMs}ms` } : undefined}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
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
        if (spId) useScenepacksStore.getState().reorderScenepackClips(spId, fromIdx, toIdx);
      }}
      onDragEnd={() => setDragOver(false)}
      onMouseEnter={() => {
        // the IntersectionObserver can lag a tick; hovering must mount immediately
        setIsVisible(true);
        setIsHovered(true);
        // a tile whose poster gave up gets another chance on interaction
        if (videoThumbFailed) {
          setVideoThumbFailed(false);
          setVideoThumbRetry(0);
        }
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        video.resetOnLeave();
      }}
    >
      <Tooltip content={isSelected ? "Deselect clip" : "Select clip"}>
        <button
          className={`clip-selected ${isSelected ? "active" : ""}`}
          onClick={(e) => onToggleSelection(clip.id, e)}
          aria-label={isSelected ? "Deselect clip" : "Select clip"}
        >
          {isSelected ? <FaCheck /> : <FaPlus />}
        </button>
      </Tooltip>

      {videoClipPending ? (
        <div className="clip clip-skeleton" style={{ borderRadius: 15 }} />
      ) : (
        <>
          {/* webp mode static thumbnail; video mode uses the poster below instead */}
          {!isVideoMode &&
            !webp.thumbnailFailed &&
            clip.thumbnailReady !== false &&
            (webpStaticReady || isVisible) && (
              <img
                ref={setThumbnailEl}
                className="clip"
                src={
                  webp.webpThumbnail ??
                  (webp.hasAnimatedWebp
                    ? `${convertFileSrc(previewWebpPath!)}?v=${importToken}`
                    : `${convertFileSrc(webp.thumbnailSrc)}?v=${importToken}`)
                }
                style={{ opacity: shouldShowThumbnail ? 1 : 0 }}
                draggable={false}
                onLoad={(e) => {
                  webp.setThumbnailLoaded(true);
                  if (showDownloadButton) sampleDownloadTone(e.currentTarget);
                }}
                onError={webp.handleThumbnailError}
                onDragStart={stopDrag}
              />
            )}

          {/* video mode poster: a still at rest, the <video> mounts only on hover */}
          {isVideoMode && clip.thumbnailReady !== false && !videoThumbFailed && (
            <img
              className="clip"
              src={`${convertFileSrc(clip.thumbnail)}?v=${importToken}${videoThumbRetry > 0 ? `&r=${videoThumbRetry}` : ""}`}
              style={{ opacity: shouldShowThumbnail ? 1 : 0 }}
              draggable={false}
              onError={() => {
                // poster jpgs fail transiently when the whole grid reloads, so
                // retry with a fresh cache-buster before giving up
                setVideoThumbRetry((attempt) => {
                  if (attempt >= VIDEO_THUMB_MAX_RETRIES) {
                    setVideoThumbFailed(true);
                    return attempt;
                  }
                  return attempt + 1;
                });
              }}
              onDragStart={stopDrag}
            />
          )}

          {showTileLoadingOverlay && (
            <div
              className="clip clip-skeleton clip-thumb-loading-overlay"
              style={{ opacity: shouldShowThumbnail ? 1 : 0 }}
            />
          )}

          {shouldMountVideo && videoSrcUrl && (
            <video
              className="clip"
              src={videoSrcUrl}
              muted={!(isHovered && audioPlaybackHover)}
              loop
              autoPlay
              playsInline
              preload="none"
              ref={video.setVideoRef}
              style={{ position: "absolute", inset: 0 }}
              draggable={false}
              onDragStart={stopDrag}
              onLoadedMetadata={video.handleLoadedMetadata}
              onPlaying={(e) => video.requestFirstFrame(e.currentTarget)}
              onLoadedData={video.handleLoadedData}
              onError={video.handleError}
            />
          )}

          {shouldShowWebpOverlay && previewWebpPath && (
            <img
              className="clip"
              style={{ position: "absolute", inset: 0, objectFit: "cover", zIndex: 3 }}
              src={`${convertFileSrc(previewWebpPath)}?v=${importToken}`}
              draggable={false}
              onDragStart={stopDrag}
            />
          )}

          {isProcessing && (
            <div className="clip-status-overlay">
              <span className="status-text">{clip.originalName}</span>
            </div>
          )}

          {showClipTimestamps && clip.startSec !== undefined && (
            <div className="clip-original-timestamp">{formatClipTime(clip.startSec)}</div>
          )}

          {showDownloadButton && (
            <DownloadButton tone={downloadTone} onClick={() => onDownloadClip(clip)} />
          )}

          {scenepackMenu && (
            <ScenepackPickerMenu
              clip={clip}
              episodeId={episodeId}
              anchor={scenepackMenu}
              onClose={() => setScenepackMenu(null)}
              onCreateNew={() => setShowScenepackModal(true)}
            />
          )}

          {activePage === "scenepacks" && (
            <Tooltip content="Remove from Scenepack">
              <button
                className="clip-remove-from-scenepack"
                onClick={(e) => {
                  e.stopPropagation();
                  const spId = useScenepacksStore.getState().openedScenepackId;
                  if (!spId) return;
                  // same path as the right-click menu, so store removal and file
                  // cleanup stay in one place
                  void removeClipsFromScenepack(spId, [
                    { index: clip.sceneIndex ?? 0, clipPath: clip.clipPath },
                  ]);
                }}
                aria-label="Remove from Scenepack"
              >
                <FaTrashAlt />
              </button>
            </Tooltip>
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
