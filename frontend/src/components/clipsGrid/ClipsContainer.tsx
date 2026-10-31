/** the clips grid: layout, selection, and the props each LazyClip tile gets */
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { LazyClip } from "./LazyClip.tsx"
import { SelectionActionBar } from "./SelectionActionBar.tsx";
import { useStaggeredMountQueue } from "./staggeredMountQueue.ts";
import useViewportAwareProxyQueue from "./proxyQueue.ts";
import useViewportAwareWebpQueue from "./webpQueue.ts";
import { useGridWindow } from "./useGridWindow.ts";
import { buildWebpJob } from "./useWebpPreview.ts";
import { useAppStateStore } from "../../stores/appStore.ts";
import { useUIStateStore } from "../../stores/UIStore.ts";
import { useGeneralSettingsStore } from "../../stores/settingsStore.ts";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore.ts";
import { clipExportSpecs } from "../../features/export/clipSpecs.ts";
import { deliverExportedFiles } from "../../features/export/deliverExports.ts";
import { remuxAudioModeForSource, remuxContainerForSource, type ExportSourceStreams } from "../../features/export/remuxPolicy.ts";
import { useScenepacksStore } from "../../stores/scenepackStore.ts";
import { useContextMenuStore } from "../../stores/contextMenuStore.ts";
import { useScenePreviewStore } from "../../stores/scenePreviewStore.ts";
import { useSceneScoutStore } from "../../stores/sceneScoutStore.ts";
import { removeClipsFromScenepack } from "../../utils/scenepackStorage.ts";
import type { ClipItem } from "../../types/domain.ts";
import type { ExportContainer } from "../../features/export/profileTypes.ts";

export default function ClipsContainer({ cols }: { cols?: number }) {
  const clips = useAppStateStore((state) => state.clips);
  const loading = useAppStateStore((state) => state.loading);
  const scoutFlowMode = useSceneScoutStore((state) => state.mode === "flow");
  const isScoutSearching = useSceneScoutStore((state) =>
    state.mode === "flow" ? state.flowSearching : state.searching
  );
  const scoutLastQuery = useSceneScoutStore((state) => state.lastQuery);
  const scoutHasFlowClip = useSceneScoutStore((state) => state.flowFrom !== null);
  const importToken = useAppStateStore((state) => state.importToken);
  const setFocusedClip = useAppStateStore((state) => state.setFocusedClip);
  const setFocusedClipId = useAppStateStore((state) => state.setFocusedClipId);
  const setSelectedClips = useAppStateStore((state) => state.setSelectedClips);
  const setLoading = useAppStateStore((state) => state.setLoading);

  // right-click menu for Scenepack clips; targets resolve at open time so label and action agree
  const [clipMenu, setClipMenu] = useState<{
    x: number;
    y: number;
    targets: ClipItem[];
  } | null>(null);

  const defaultCols = useUIStateStore((state) => state.cols);
  const activePage = useUIStateStore((state) => state.activePage);
  // one field, not the whole settings store, so a settings change doesn't re-render the grid
  const episodesPath = useGeneralSettingsStore((state) => state.episodesPath);
  const openedEpisodeId = useEpisodePanelRuntimeStore((state) => state.openedEpisodeId);
  const episodes = useEpisodePanelRuntimeStore((state) => state.episodes);

  const activeCols = cols ?? defaultCols;

  // another menu claimed the slot, so this one is stale
  const activeContextMenu = useContextMenuStore((s) => s.activeMenu);
  useEffect(() => {
    if (activeContextMenu !== "scenepack-clip") setClipMenu(null);
  }, [activeContextMenu]);

  const handleClipContextMenu = useCallback(
    (event: React.MouseEvent, clip: ClipItem) => {
      if (activePage !== "scenepacks") return;
      event.preventDefault();
      event.stopPropagation();

      const selected = useAppStateStore.getState().selectedClips;
      const inSelection = selected.has(clip.id);
      const targets = inSelection
        ? useAppStateStore.getState().clips.filter((c) => selected.has(c.id))
        : [clip];

      if (!inSelection) setSelectedClips(new Set([clip.id]));

      useContextMenuStore.getState().openContextMenu("scenepack-clip");
      setClipMenu({ x: event.clientX, y: event.clientY, targets });
    },
    [activePage, setSelectedClips],
  );

  const handleDeleteFromScenepack = useCallback(async () => {
    const menu = clipMenu;
    setClipMenu(null);
    if (!menu) return;

    const scenepackId = useScenepacksStore.getState().openedScenepackId;
    if (!scenepackId) return;

    // sceneIndex is the clip's position in the pack, which is what the store removes by
    await removeClipsFromScenepack(
      scenepackId,
      menu.targets.map((c) => ({ index: c.sceneIndex ?? 0, clipPath: c.clipPath })),
    );

    setSelectedClips(new Set());
    setFocusedClip(null);
    setFocusedClipId(null);
  }, [clipMenu, setSelectedClips, setFocusedClip, setFocusedClipId]);

  // any click or right-click elsewhere dismisses the menu, like the episode panel's
  useEffect(() => {
    if (!clipMenu) return;
    const close = () => setClipMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [clipMenu]);

  const episodeVideoPreview = useMemo(() => {
    // pack clips are always materialized videos, whatever their source episode used
    if (activePage === "scenepacks") return true;

    // scout results play a bounded range of the source video
    if (activePage === "sceneScout") return true;

    const openedEpisode = episodes.find((e) => e.id === openedEpisodeId);
    return (
      openedEpisode?.importMethod === "video_files" ||
      (openedEpisode?.importMethod === undefined && clips.some((c) => Boolean(c.clipPath)))
    );
  }, [activePage, episodes, openedEpisodeId, clips]);

  // proxy queue: manages HEVC/H.264 proxy generation and prioritization
  const { requestProxySequential, reportProxyDemand } = useViewportAwareProxyQueue();
  // WebP queue: generates scene previews using viewport/hover priority
  const { reportWebpDemand, primeFromDiskCache, resetWebpQueue } = useViewportAwareWebpQueue({
    episodeCacheId: openedEpisodeId,
    customPath: episodesPath,
  });
  // staggered mount queue: mounts videos one at a time in grid preview
  const { reportStaggerDemand } = useStaggeredMountQueue();

  const gridColumns = loading
    ? activeCols
    : Math.max(1, Math.min(activeCols, clips.length));

  // the grid (not each tile) is capped and centered, so tiles fill their columns edge to edge
  const gridMaxWidth = gridColumns <= 1
    ? "920px"
    : `${gridColumns * 640 + (gridColumns - 1) * 15}px`;

  const handleDownloadSingleClip = useCallback(async (clip: (typeof clips)[number]) => {
    try {
      // read at call time so this callback passed to every tile stays stable
      const settings = useGeneralSettingsStore.getState();
      const activeProfile = settings.exportProfiles.find(
        (candidate) => candidate.id === settings.activeExportProfileId
      ) ?? settings.exportProfiles[0];
      let format: ExportContainer = activeProfile?.container ?? "mp4";
      const fileName = clip.originalName || clip.src.split(/[\\/]/).pop() || "clip";
      const srcs = clipExportSpecs(clip);
      const sourcePath = srcs[0]?.input;
      let source: ExportSourceStreams = { videoCodec: null, audioCodecs: [] };
      if (activeProfile?.workflow === "video_remux" && sourcePath) {
        try {
          source = await invoke<ExportSourceStreams>("probe_export_source_streams", { videoPath: sourcePath });
        } catch (error) {
          console.warn("Could not inspect remux source streams", error);
        }
        format = remuxContainerForSource(sourcePath, source.videoCodec);
      }
      const defaultPath = `${fileName}.${format}`;

      const savePath = await save({
        defaultPath,
        filters: [{ name: "Video", extensions: [format] }],
      });

      if (!savePath) return;

      setLoading(true);

      const exportOptions = {
        profileId: activeProfile.id,
        workflow: activeProfile.workflow,
        editorTarget: activeProfile.editorTarget,
        codec: activeProfile.codec,
        audioMode: activeProfile.workflow === "video_remux"
          ? remuxAudioModeForSource(activeProfile.audioMode, format, source.audioCodecs)
          : activeProfile.container === "mov" && activeProfile.audioMode === "flac"
            ? "alac"
            : activeProfile.audioMode === "none"
              ? "copy"
              : activeProfile.audioMode,
        hardwareMode: activeProfile.hardwareMode,
        parallelExports: activeProfile.parallelExports,
      };

      const exportedFiles = await invoke<string[]>("export_clips", {
        clips: srcs,
        savePath,
        mergeEnabled: srcs.length > 1,
        exportOptions,
      });

      await deliverExportedFiles(exportedFiles);
    } catch (err) {
      console.error("Single clip download failed:", err);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const handleClipClick = useCallback(
    (clipId: string, clipSrc: string, index: number, e: React.MouseEvent<HTMLDivElement>) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      const state = useAppStateStore.getState();
      // read at click time so the callback stays stable while clips stream in
      const currentClips = state.clips;

      if (isShift) {
        const anchorIndex = state.focusedClipId
          ? currentClips.findIndex((c) => c.id === state.focusedClipId)
          : -1;
        const startIndex = anchorIndex !== -1 ? anchorIndex : index;
        const [start, end] = [startIndex, index].sort((a, b) => a - b);
        const rangeIds = currentClips.slice(start, end + 1).map((c) => c.id);

        startTransition(() => {
          setSelectedClips(new Set(rangeIds));
        });
        return;
      }

      if (isCtrlOrCmd) {
        startTransition(() => {
          setSelectedClips((prev) => {
            const next = new Set(prev);
            next.has(clipId) ? next.delete(clipId) : next.add(clipId);
            return next;
          });
        });
        return;
      }

      // single click: focus this clip for preview without toggling selection
      setFocusedClip(clipSrc);
      setFocusedClipId(clipId);
    },
    [setFocusedClip, setFocusedClipId, setSelectedClips]
  );

  const handleToggleSelection = useCallback(
    (clipId: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger focus click
      startTransition(() => {
        setSelectedClips((prev) => {
          const next = new Set(prev);
          next.has(clipId) ? next.delete(clipId) : next.add(clipId);
          return next;
        });
      });
    },
    [setSelectedClips]
  );

  // handles double-click on a clip tile (toggle export selection, checkmark only)
  const handleClipDoubleClick = useCallback(
    (clipId: string, _clipSrc: string, _index: number, _e: React.MouseEvent<HTMLDivElement>) => {
      startTransition(() => {
        setSelectedClips((prev) => {
          const next = new Set(prev);
          next.has(clipId) ? next.delete(clipId) : next.add(clipId);
          return next;
        });
      });
    },
    [setSelectedClips]
  );


  // ref for the main container (for scroll-to-top on import)
  const containerRef = useRef<HTMLElement>(null);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);

  // only the rows near the viewport are mounted; the rest is grid padding
  const gridWindow = useGridWindow({
    scrollRef: containerRef,
    gridEl,
    itemCount: clips.length,
    columns: gridColumns,
  });
  const visibleClips = useMemo(
    () =>
      clips
        .slice(gridWindow.start, gridWindow.end)
        .map((clip, offset) => ({ clip, index: gridWindow.start + offset })),
    [clips, gridWindow.start, gridWindow.end]
  );

  // the grid stays mounted on other pages, but display:none can drop its scroll offset, so it is restored
  const lastScrollTopRef = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      // skeletons replace the grid while loading and clamp scrollTop, so ignore those events
      if (useAppStateStore.getState().loading) return;
      lastScrollTopRef.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    if (activePage !== "home") return;
    const el = containerRef.current;
    if (!el) return;
    const target = lastScrollTopRef.current;
    if (target > 0 && Math.abs(el.scrollTop - target) > 1) {
      el.scrollTop = target;
    }
  }, [activePage]);

  // keep the scroll position across non-import loading toggles (e.g. exporting)
  const savedScrollRef = useRef<number | null>(null);
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      prevLoadingRef.current = loading;
      return;
    }
    if (loading && !prevLoadingRef.current) {
      // loading just started; el.scrollTop is already clamped by the skeletons, use the last real position
      savedScrollRef.current = lastScrollTopRef.current;
    } else if (!loading && prevLoadingRef.current && savedScrollRef.current !== null) {
      // loading finished, restore scroll once the grid and its window padding have re-rendered
      const target = savedScrollRef.current;
      savedScrollRef.current = null;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ top: target });
      }));
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    // new import - discard any pending scroll restore and go to the top
    savedScrollRef.current = null;
    lastScrollTopRef.current = 0;
    containerRef.current?.scrollTo({ top: 0 });
    resetWebpQueue();
    // every fresh episode view starts with Preview All off
    useUIStateStore.getState().setGridPreview(false);
  }, [importToken, resetWebpQueue]);

  // the open episode was deleted or closed: its webp previews stop with it
  useEffect(() => {
    if (!openedEpisodeId) resetWebpQueue();
  }, [openedEpisodeId, resetWebpQueue]);

  // registers every clip, not just mounted tiles, so the loading total is the episode's (after the reset effect above)
  useEffect(() => {
    if (episodeVideoPreview) return;
    // read, don't subscribe; clips with a preview are skipped so the total doesn't shrink as you scroll
    const resolved = useScenePreviewStore.getState().animatedByClipId;
    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index];
      if (resolved[clip.id]) continue;
      const job = buildWebpJob(clip, clip.episodeId ?? openedEpisodeId ?? null);
      if (!job) continue;
      reportWebpDemand(clip.id, { isVisible: false, order: index, priority: false, job });
    }
  }, [clips, episodeVideoPreview, openedEpisodeId, reportWebpDemand, importToken]);

  // tiles fade in when an episode opens; the class is removed after, or display:none page switches would replay it
  const [tilesAppearing, setTilesAppearing] = useState(true);
  useEffect(() => {
    setTilesAppearing(true);
    const timeout = window.setTimeout(() => setTilesAppearing(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [importToken]);

  // diagonal stagger from the top-left tile, capped so huge grids finish promptly
  const appearDelayFor = useCallback(
    (index: number) => {
      if (!tilesAppearing) return null;
      const row = Math.floor(index / gridColumns);
      const col = index % gridColumns;
      return Math.min((row + col) * 40, 600);
    },
    [tilesAppearing, gridColumns]
  );

  useEffect(() => {
    // pack clips come from many episodes, so each job carries its own cache id; the disk lookup keeps reopening fast
    if (activePage === "scenepacks") {
      if (clips.length === 0) return;

      const jobs = clips
        .map((clip) => {
          if (clip.clipPath) return null; // video-mode clips don't use WebP queue

          const sourcePath = clip.originalPath || clip.src;
          const start = clip.startSec ?? 0;
          const rawEnd = clip.endSec ?? (start + 2);
          const end = Math.min(rawEnd > start ? rawEnd : start + 2, start + 2.5);

          if (!sourcePath) return null;
          return {
            clipId: clip.id,
            sourcePath,
            start,
            end,
            fps: 8,
            episodeCacheId: clip.episodeId ?? null,
          };
        })
        .filter((job): job is NonNullable<typeof job> => Boolean(job));

      void primeFromDiskCache(jobs);
      return;
    }

    // only WebP-preview episodes use the WebP cache
    if (episodeVideoPreview) {
      return;
    }

    if (!openedEpisodeId || clips.length === 0) return;

    // ids lead with the episode id, so a mismatch means clips still belong to the previous episode
    if (!clips[0].id.startsWith(openedEpisodeId)) return;

    const jobs = clips
      .map((clip) => {
        if (clip.clipPath) return null; // video-mode clips don't use WebP queue

        const sourcePath = clip.originalPath || clip.src;
        const start = clip.startSec ?? 0;
        const rawEnd = clip.endSec ?? (start + 2);
        const end = Math.min(rawEnd > start ? rawEnd : start + 2, start + 2.5);

        if (!sourcePath) return null;
        return {
          clipId: clip.id,
          sourcePath,
          start,
          end,
          fps: 8,
        };
      })
      .filter((job): job is NonNullable<typeof job> => Boolean(job));

    void primeFromDiskCache(jobs);
  }, [clips, episodeVideoPreview, openedEpisodeId, primeFromDiskCache, activePage]);

  // ctrl + wheel to adjust the grid column count
  const setStoreCols = useUIStateStore((state) => state.setCols);
  const colsOverridden = cols !== undefined;
  const wheelAccumRef = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || colsOverridden) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      wheelAccumRef.current += e.deltaY;
      const threshold = 40;
      if (Math.abs(wheelAccumRef.current) < threshold) return;

      const direction = wheelAccumRef.current > 0 ? 1 : -1;
      wheelAccumRef.current = 0;

      setStoreCols((prev) => {
        const next = prev + direction;
        return Math.max(1, Math.min(12, next));
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [colsOverridden, setStoreCols]);

  const showLoadingSkeletons = loading || (activePage === "sceneScout" && isScoutSearching);

  return (
    <main className="clips-container" ref={containerRef}>
      {showLoadingSkeletons ? (
        <div
          className="clips-grid"
          style={{
            gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
            ["--grid-max-width" as any]: gridMaxWidth,
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="clip-skeleton" />
          ))}
        </div>
      ) : clips.length === 0 ? (
        <div className="empty-grid-wrapper">
          <p id="empty-grid">
            {activePage === "scenepacks"
              ? <>No Scenepack opened.<br/>Select one from the sidebar to view its clips.</>
              : activePage === "sceneScout" && scoutFlowMode
              ? (
                scoutHasFlowClip ? (
                  <>No scenes found for this clip.<br/>Add a database to the Searching list on the left.</>
                ) : (
                  <>No clip to continue yet.<br/>Input an episode above, or select a clip in your Library and click Find flowing clips.</>
                )
              )
              : activePage === "sceneScout"
              ? (
                scoutLastQuery ? (
                  <>No scenes matched your search.<br/>Try changing your search terms.</>
                ) : (
                  <>No scenes found.<br/>Select one or more databases on the left, describe a scene, and press Enter to search.</>
                )
              )
              : <>No video loaded.<br/>If no clips are displaying, try changing the episode storage path in general settings.</>}
          </p>
        </div>
      ) : (
        <>
          <SelectionActionBar />
          <div
            key={importToken}
            className="clips-grid"
            ref={setGridEl}
            style={{
              gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
              ["--grid-max-width" as any]: gridMaxWidth,
              paddingTop: gridWindow.padTop ? `calc(15px + ${gridWindow.padTop}px)` : undefined,
              paddingBottom: gridWindow.padBottom ? `calc(15px + ${gridWindow.padBottom}px)` : undefined,
            }}
          >
            {visibleClips.map(({ clip, index }) => (
              <LazyClip
                key={clip.id}
                clip={clip}
                index={index}
                videoPreviewMode={episodeVideoPreview}
                requestProxySequential={requestProxySequential}
                reportProxyDemand={reportProxyDemand}
                reportWebpDemand={reportWebpDemand}
                reportStaggerDemand={reportStaggerDemand}
                onClipClick={handleClipClick}
                onClipDoubleClick={handleClipDoubleClick}
                onToggleSelection={handleToggleSelection}
                onDownloadClip={handleDownloadSingleClip}
                onClipContextMenu={handleClipContextMenu}
                appearDelayMs={appearDelayFor(index)}
              />
            ))}
          </div>

          {clipMenu && (
            <div
              className="episode-context-menu"
              style={{ left: clipMenu.x, top: clipMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {clipMenu.targets.length === 1 && clipMenu.targets[0].thumbnail && (
                <button
                  className="episode-context-menu-item"
                  onClick={() => {
                    const packId = useScenepacksStore.getState().openedScenepackId;
                    const thumbnail = clipMenu.targets[0].thumbnail;
                    if (packId && thumbnail) {
                      useScenepacksStore.getState().setScenepackThumbnail(packId, thumbnail);
                    }
                    setClipMenu(null);
                  }}
                >
                  Set as Scenepack thumbnail
                </button>
              )}

              <button
                className="episode-context-menu-item"
                onClick={() => void handleDeleteFromScenepack()}
              >
                {clipMenu.targets.length > 1
                  ? `Delete ${clipMenu.targets.length} clips`
                  : "Delete clip"}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
