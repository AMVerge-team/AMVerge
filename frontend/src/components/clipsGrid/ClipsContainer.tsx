/**
 * ClipsContainer.tsx
 *
 * main grid container for displaying video clips. Handles layout, selection logic, and passes props to each tile (LazyClip).
 * optimized for performance with lazy loading, proxying, and staggered mounting.
 */
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
import { useScenepacksStore } from "../../stores/scenepackStore.ts";
import { useScenePreviewStore } from "../../stores/scenePreviewStore.ts";
import { removeClipsFromScenepack } from "../../utils/scenepackStorage.ts";
import type { ClipItem } from "../../types/domain.ts";

export default function ClipsContainer({ cols }: { cols?: number }) {
  const clips = useAppStateStore((state) => state.clips);
  const loading = useAppStateStore((state) => state.loading);
  const importToken = useAppStateStore((state) => state.importToken);
  const setFocusedClip = useAppStateStore((state) => state.setFocusedClip);
  const setFocusedClipId = useAppStateStore((state) => state.setFocusedClipId);
  const setSelectedClips = useAppStateStore((state) => state.setSelectedClips);
  const setLoading = useAppStateStore((state) => state.setLoading);

  // Right-click menu for Scenepack clips. `targets` is resolved at open time so
  // the label and the action can never disagree about what gets deleted.
  const [clipMenu, setClipMenu] = useState<{
    x: number;
    y: number;
    targets: ClipItem[];
  } | null>(null);

  const defaultCols = useUIStateStore((state) => state.cols);
  const activePage = useUIStateStore((state) => state.activePage);
  // subscribe only to the settings field used during render. Reading the whole
  // settings store here re-rendered the entire grid on any settings change.
  const episodesPath = useGeneralSettingsStore((state) => state.episodesPath);
  const openedEpisodeId = useEpisodePanelRuntimeStore((state) => state.openedEpisodeId);
  const episodes = useEpisodePanelRuntimeStore((state) => state.episodes);

  const activeCols = cols ?? defaultCols;

  // preview mode is a per-episode property fixed at import time — NOT the global
  // import-method setting. Legacy episodes without a stored method are inferred
  // from whether their clips have cut video paths. Memoized so the O(n) clip scan
  // doesn't run on every scroll-driven re-render.
  // Right-clicking a clip that is part of the current selection acts on the
  // whole selection; right-clicking outside it acts on that one clip only
  // (and makes it the selection, so the highlight matches what will go).
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

    // sceneIndex is the clip's position in the pack (ScenepacksPage assigns it
    // from the array index), which is what the store removes by.
    await removeClipsFromScenepack(
      scenepackId,
      menu.targets.map((c) => ({ index: c.sceneIndex ?? 0, clipPath: c.clipPath })),
    );

    setSelectedClips(new Set());
    setFocusedClip(null);
    setFocusedClipId(null);
  }, [clipMenu, setSelectedClips, setFocusedClip, setFocusedClipId]);

  // Any click elsewhere dismisses the menu, same as the episode panel's.
  useEffect(() => {
    if (!clipMenu) return;
    const close = () => setClipMenu(null);
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [clipMenu]);

  const episodeVideoPreview = useMemo(() => {
    // Scenepacks aren't an episode: every clip in one is a materialized video
    // file, whatever the episode it was taken from used. Reading the (possibly
    // still-open) episode's method here showed WebP-sourced pack clips as stills.
    if (activePage === "scenepacks") return true;

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

  // Register every clip in the episode, not just the tiles currently mounted:
  // the queue works through offscreen demand in its own lane, and the loading
  // count has to be the episode's total rather than however far you scrolled.
  // Tiles still raise their own entry's priority while visible or hovered.
  useEffect(() => {
    if (episodeVideoPreview) return;
    // Read, don't subscribe: results stream in constantly and the grid must not
    // re-render for each. Clips that already have a preview are skipped so they
    // never enter the loading count - counting them made the total shrink as you
    // scrolled, when their tile mounted and withdrew the demand.
    const resolved = useScenePreviewStore.getState().animatedByClipId;
    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index];
      if (resolved[clip.id]) continue;
      const job = buildWebpJob(clip, clip.episodeId ?? openedEpisodeId ?? null);
      if (!job) continue;
      reportWebpDemand(clip.id, { isVisible: false, order: index, priority: false, job });
    }
  }, [clips, episodeVideoPreview, openedEpisodeId, reportWebpDemand]);

  // calculate number of columns for the grid
  const gridColumns = loading
    ? activeCols
    : Math.max(1, Math.min(activeCols, clips.length));

  // cap + center the grid (not each tile) so tiles fill their columns
  // edge-to-edge instead of shrinking to a fixed max and leaving gaps. Width
  // scales with the column count; a single-column view keeps a tighter cap for
  // one big preview. The grid only centers once the window exceeds this width.
  const gridMaxWidth = gridColumns <= 1
    ? "920px"
    : `${gridColumns * 640 + (gridColumns - 1) * 15}px`;

  const handleDownloadSingleClip = useCallback(async (clip: (typeof clips)[number]) => {
    try {
      // read settings at call time so this callback stays referentially stable —
      // it's passed to every tile, so depending on the settings object would
      // re-render the whole grid whenever any setting changed.
      const settings = useGeneralSettingsStore.getState();
      const activeProfile = settings.exportProfiles.find(
        (candidate) => candidate.id === settings.activeExportProfileId
      ) ?? settings.exportProfiles[0];
      const format = activeProfile?.container || settings.exportFormat || "mp4";
      const fileName = clip.originalName || clip.src.split(/[\\/]/).pop() || "clip";
      const defaultPath = `${fileName}.${format}`;

      const savePath = await save({
        defaultPath,
        filters: [{ name: "Video", extensions: [format] }],
      });

      if (!savePath) return;

      setLoading(true);

      const srcs = clipExportSpecs(clip);
      const exportOptions = {
        profileId: activeProfile.id,
        workflow: activeProfile.workflow,
        editorTarget: activeProfile.editorTarget,
        codec: activeProfile.codec,
        audioMode:
          activeProfile.container === "mov" && activeProfile.audioMode === "flac"
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
      // read clips from the store at click time rather than closing over them, so
      // this callback stays stable across clip patches (streaming import) and
      // doesn't re-render every memoized tile each time a clip updates.
      const currentClips = state.clips;

      // shift-click: select a range of clips
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

      // ctrl/Cmd-click: toggle selection state for this clip
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

  // handles double-click on a clip tile (toggle export selection — checkmark only)
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

  // the grid stays mounted while another page is open (so nothing regenerates on
  // return), but the browser can drop a scroll container's offset while it's
  // display:none. Track the live scroll position and restore it when the home
  // page becomes visible again so you keep your place.
  const lastScrollTopRef = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => { lastScrollTopRef.current = el.scrollTop; };
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

  // preserve scroll position across loading-state toggles that don't come from
  // an import (e.g. exporting). When importToken changes we still want the
  // scroll-to-top behaviour below.
  const savedScrollRef = useRef<number | null>(null);
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      prevLoadingRef.current = loading;
      return;
    }
    if (loading && !prevLoadingRef.current) {
      // loading just started — remember where we were so we can restore.
      savedScrollRef.current = el.scrollTop;
    } else if (!loading && prevLoadingRef.current && savedScrollRef.current !== null) {
      // loading finished — restore scroll after the grid re-renders.
      const target = savedScrollRef.current;
      savedScrollRef.current = null;
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ top: target });
      });
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    // new import - discard any pending scroll restore and go to the top.
    savedScrollRef.current = null;
    containerRef.current?.scrollTo({ top: 0 });
    resetWebpQueue();
    // every fresh episode view (open / import / refresh / startup auto-open)
    // starts with Preview All disabled.
    useUIStateStore.getState().setGridPreview(false);
  }, [importToken, resetWebpQueue]);

  // entrance animation: tiles fade in top-left → bottom-right when an episode
  // opens (importToken changes, including app startup auto-open). The class is
  // only applied during a short window and then removed — CSS animations replay
  // when a display:none ancestor becomes visible again, so leaving the class on
  // would re-run the fade every time the user returns to the home page.
  const [tilesAppearing, setTilesAppearing] = useState(true);
  useEffect(() => {
    setTilesAppearing(true);
    const timeout = window.setTimeout(() => setTilesAppearing(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [importToken]);

  // diagonal stagger: delay grows with (row + col), so the wave sweeps from the
  // top-left tile to the bottom-right. Capped so huge grids finish promptly.
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
    // Scenepacks page: clips can come from several different episodes, so each
    // job carries its own episodeCacheId (clip.episodeId) instead of relying on
    // the shared queue context. Scenepacks always fully remounts on page switch
    // (unlike Home, which stays alive via display:none), so the in-memory queue
    // cache never survives a reopen — this batched disk lookup is what keeps a
    // reopen fast instead of re-encoding every clip from scratch.
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

    // the WebP disk-cache prime only applies to WebP-preview episodes; video
    // episodes show cut clips and never touch the WebP cache.
    if (episodeVideoPreview) {
      return;
    }

    if (!openedEpisodeId || clips.length === 0) return;

    // on an episode switch, `openedEpisodeId` updates one render before the
    // transition-deferred `clips` do. Clip ids are `${episodeId}_${sceneIndex}`,
    // so a leading-id mismatch means these clips still belong to the previous
    // episode — skip the throwaway cache lookup until `clips` catches up.
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

  return (
    <main className="clips-container" ref={containerRef}>
      {clips.length === 0 ? (
        <div className="empty-grid-wrapper">
          <p id="empty-grid">
            {activePage === "scenepacks"
              ? <>No Scenepack opened.<br/>Select one from the sidebar to view its clips.</>
              : <>No video loaded.<br/>If no clips are displaying, try changing the episode storage path in general settings.</>}
          </p>
        </div>
      ) : loading ? (
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
