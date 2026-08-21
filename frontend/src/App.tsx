import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Event, listen } from "@tauri-apps/api/event";
import { DEFAULT_GENERAL_SETTINGS } from "./stores/settingsStore";

import AppLayout from "./components/AppLayout";
import HomePage from "./pages/HomePage";
import SettingsModal from "./components/settings/SettingsModal";
import QuickMenu from "./components/QuickMenu";
import MenuModal from "./components/menu/MenuModal";
import ScenepacksPage from "./pages/ScenepacksPage";
import ImportTerminal from "./components/ImportTerminal";
import BgProgressBar from "./components/BgProgressBar";
import StartupNotificationModal, { type StartupNotification } from "./components/StartupNotificationModal";
import PostExportPassesModal from "./components/PostExportPassesModal";
import AiInstallModal from "./components/AiInstallModal";

import useDiscordRPC from "./hooks/useDiscordRPC";
import useHEVCSupport from "./hooks/useHEVCSupport";
import useDragDropImport from "./hooks/useDragDropImport";
import useImportExport from "./hooks/useImportExport";
import useStartupUpdateNotification from "./hooks/useStartupUpdateNotification";

import { remapClipPaths, remapPathRoot } from "./utils/episodeUtils";
import { useScenePreviewStore } from "./stores/scenePreviewStore";

import { useAiDepsStore } from "./stores/aiDepsStore";
import { useAppStateStore } from "./stores/appStore";
import { useWebpLoadingStore } from "./stores/webpLoadingStore";
import { useUIStateStore } from "./stores/UIStore";
import { applyThemeSettings, useGeneralSettingsStore, useThemeSettingsStore } from "./stores/settingsStore";
import { useEpisodePanelRuntimeStore } from "./stores/episodeStore";


function App() {
  const loading = useAppStateStore((s) => s.loading);
  const progress = useAppStateStore((s) => s.progress);
  const progressMsg = useAppStateStore((s) => s.progressMsg);
  const batchTotal = useAppStateStore((s) => s.batchTotal);
  const batchDone = useAppStateStore((s) => s.batchDone);
  const batchCurrentFile = useAppStateStore((s) => s.batchCurrentFile);
  const bgProgress = useAppStateStore((s) => s.bgProgress);
  const bgImportProgress = useAppStateStore((s) => s.bgImportProgress);
  const reencodeProgress = useAppStateStore((s) => s.reencodeProgress);
  const webpLoadDone = useWebpLoadingStore((s) => s.done);
  const webpLoadTotalRaw = useWebpLoadingStore((s) => s.total);
  const webpDismissed = useWebpLoadingStore((s) => s.dismissed);
  // Closing the card hides the preview counter for the rest of this episode;
  // the queue keeps filling the cache in the background.
  const webpLoadTotal = webpDismissed ? 0 : webpLoadTotalRaw;
  const sceneDetectionMethod = useGeneralSettingsStore((s) => s.sceneDetectionMethod);
  const importMethodSetting = useGeneralSettingsStore((s) => s.importMethod);
  const activeOperation = useAppStateStore((s) => s.activeOperation);
  const clearBgProgress = () => {
    useAppStateStore.setState((s) => ({ ...s, bgProgress: null, bgImportProgress: null, reencodeProgress: null }));
    useWebpLoadingStore.getState().reset();
  };
  const setProgress = useAppStateStore((s) => s.setProgress);
  const setProgressMsg = useAppStateStore((s) => s.setProgressMsg);
  const setVideoIsHEVC = useAppStateStore((s) => s.setVideoIsHEVC);
  const importedVideoPath = useAppStateStore((s) => s.importedVideoPath);
  const importToken = useAppStateStore((s) => s.importToken);


  // refs
  const windowWrapperRef = useRef<HTMLDivElement | null>(null);
  const mainLayoutWrapperRef = useRef<HTMLDivElement | null>(null);
  const userHasHEVC = useAppStateStore((s) => s.userHasHEVC);
  const abortedRef = useRef(false);

  // UI state
  const generalSettings = useGeneralSettingsStore();
  const themeSettings = useThemeSettingsStore();


  const sidebarEnabled = useUIStateStore(s => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore(s => s.setSidebarEnabled);
  const activePage = useUIStateStore(s => s.activePage);
  const isDragging = useUIStateStore(s => s.isDragging);

  const handleResetGeneralSettings = async () => {
    try {
      // Release the clip files the grid holds open, or Windows blocks the move
      // of anything currently on screen.
      useAppStateStore.getState().setClips([]);
      useAppStateStore.getState().setSelectedClips(new Set());
      await new Promise((resolve) => setTimeout(resolve, 250));

      const resolvedOldPath = await invoke<string>("move_episodes_to_new_dir", {
        oldDir: generalSettings.episodesPath,
        newDir: null,
      });

      const defaultEpisodesPath = await invoke<string>("get_default_episodes_dir");

      remapEpisodePaths(resolvedOldPath, defaultEpisodesPath);      
      useGeneralSettingsStore.setState(DEFAULT_GENERAL_SETTINGS);
    } catch (err) {
      window.alert("Failed to reset episode directory: " + String(err));
    }
  };

  const handleResetTheme = async() => {
    useThemeSettingsStore.getState().resetThemeSettings();
  }

  const [dividerOffsetPx, setDividerOffsetPx] = useState(0);
  const [startupNotification, setStartupNotification] = useState<StartupNotification | null>(null);
  const [showStartupNotification, setShowStartupNotification] = useState(false);
  const startupUpdateNotification = useStartupUpdateNotification();

  const parseThumbnailProgress = (message: string): { done: number; total: number } | null => {
    const match = message.match(/generating thumbnails\.\.\.\s*(\d+)\s*\/\s*(\d+)/i);
    if (!match) return null;

    const done = Number.parseInt(match[1], 10);
    const total = Number.parseInt(match[2], 10);
    if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;

    return { done: Math.max(0, done), total };
  };

  // persisted UI state
  const sidebarWidthPx = useUIStateStore(s => s.sidebarWidthPx);
  const setSidebarWidthPx = useUIStateStore(s => s.setSidebarWidthPx);

  function startSidebarResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!sidebarEnabled) return;

    const wrapper = windowWrapperRef.current;
    if (!wrapper) return;

    e.preventDefault();
    e.stopPropagation();

    const pointerId = e.pointerId;
    e.currentTarget.setPointerCapture(pointerId);
    document.body.classList.add("is-resizing-sidebar");

    const onPointerMove = (ev: PointerEvent) => {
      const rect = wrapper.getBoundingClientRect();
      const minWidth = 220;
      const maxWidth = Math.max(minWidth, Math.floor(rect.width * 0.6));
      const proposed = Math.round(ev.clientX - rect.left);
      const clamped = Math.min(maxWidth, Math.max(minWidth, proposed));

      setSidebarWidthPx(clamped);
    };

    const stop = () => {
      document.body.classList.remove("is-resizing-sidebar");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  const remapEpisodePaths = (oldRoot: string, newRoot: string) => {
    useEpisodePanelRuntimeStore.setState((s) => ({
      episodes: s.episodes.map((episode) => ({
        ...episode,
        videoPath: remapPathRoot(episode.videoPath, oldRoot, newRoot),
        clips: episode.clips.map((clip) => remapClipPaths(clip, oldRoot, newRoot)),
      }))
    }));

    useAppStateStore.setState((s) => ({
      clips: s.clips.map((clip) => remapClipPaths(clip, oldRoot, newRoot)),
      importedVideoPath: s.importedVideoPath
        ? remapPathRoot(s.importedVideoPath, oldRoot, newRoot)
        : s.importedVideoPath,
    }));

    useScenePreviewStore.setState((s) => {
      const next: Record<string, string> = {};
      for (const [clipId, path] of Object.entries(s.animatedByClipId)) {
        next[clipId] = remapPathRoot(path, oldRoot, newRoot);
      }
      return { animatedByClipId: next };
    });

    useAppStateStore.getState().setImportToken(Date.now().toString());
  };

  // import/export
  const { updateRPC } = useDiscordRPC();

  const { handleImport, handleBatchImport } = useImportExport({
    abortedRef,
    onRPCUpdate: updateRPC
  });

  // app-level hooks
  useHEVCSupport();

  useDragDropImport({
    handleImport,
    handleBatchImport
  });

  async function handleAbort() {
    abortedRef.current = true;

    try {
      await Promise.allSettled([
        invoke("abort_detect_scenes"),
        invoke("abort_export"),
        invoke("abort_editor_import"),
      ]);
    } catch (err) {
      console.error("abort tasks failed:", err);
    }
  }

  const bgActive =
    !!(bgProgress || bgImportProgress || reencodeProgress) || webpLoadTotal > 0;
  const [importUiActive, setImportUiActive] = useState(false);
  // null = follow auto behaviour; true/false = user's explicit minimize choice.
  const [minimizeOverride, setMinimizeOverride] = useState<boolean | null>(null);

  useEffect(() => {
    void useAiDepsStore.getState().refresh();
  }, []);

  useEffect(() => {
    if (loading) setImportUiActive(true);
  }, [loading]);
  useEffect(() => {
    if (!loading && !bgActive) {
      setImportUiActive(false);
      setMinimizeOverride(null);
    }
  }, [loading, bgActive]);

  // auto-minimize once the heavy phase (scene detect + first clip cuts) is done
  // and only background thumbnail/reencode/preview work remains.
  const autoMinimized = !loading && bgActive;
  const overlayMinimized = minimizeOverride !== null ? minimizeOverride : autoMinimized;

  async function handleAbortAndCloseBgProgress() {
    const { bgProgress: bg, bgImportProgress: bgImport, reencodeProgress: reenc } =
      useAppStateStore.getState();
    if (bg || bgImport || reenc) {
      await handleAbort();
    }
    clearBgProgress();
    useWebpLoadingStore.getState().dismiss();
  }

  // effects
  useEffect(() => {
    applyThemeSettings(themeSettings);
  }, [themeSettings]);

  useEffect(() => {
    if (activePage === "scenepacks" && !generalSettings.scenepacksEnabled) {
      useUIStateStore.getState().setActivePage("home");
    }
  }, [activePage, generalSettings.scenepacksEnabled]);

  useEffect(() => {
    if (!startupUpdateNotification) {
      return;
    }

    setStartupNotification(startupUpdateNotification);
    setShowStartupNotification(true);
  }, [startupUpdateNotification]);

  const handleCloseStartupNotification = (_doNotShowAgain: boolean) => {
    setShowStartupNotification(false);
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      const stop = await listen<{ percent: number; message: string }>(
        "scene_progress",
        (event: Event<{ percent: number; message: string }>) => {
          setProgress(event.payload.percent);
          setProgressMsg(event.payload.message);

          const parsed = parseThumbnailProgress(event.payload.message);
          if (!parsed) return;

          useAppStateStore.setState((s) => {
            const nextTotal = parsed.total;
            const nextDone = Math.min(
              nextTotal,
              Math.max(s.bgProgress?.done ?? 0, parsed.done)
            );

            if (s.bgProgress?.done === nextDone && s.bgProgress?.total === nextTotal) {
              return s;
            }

            return { ...s, bgProgress: { done: nextDone, total: nextTotal } };
          });
        }
      );

      unlisten = stop;
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!importedVideoPath) {
      setVideoIsHEVC(null);
      return;
    }

    let cancelled = false;

    setVideoIsHEVC(null);

    (async () => {
      try {
        const hevc = await invoke<boolean>("check_hevc", { videoPath: importedVideoPath });

        if (!cancelled) {
          setVideoIsHEVC(hevc);
        }
      } catch (err) {
        console.error("codec probe failed:", err);

        if (!cancelled) {
          setVideoIsHEVC(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [importedVideoPath, importToken, setVideoIsHEVC]);

  useEffect(() => {
    const update = () => {
      const ww = windowWrapperRef.current;
      const ml = mainLayoutWrapperRef.current;

      if (!ww || !ml) return;

      const wwRect = ww.getBoundingClientRect();
      const mlRect = ml.getBoundingClientRect();

      if (mlRect.height === 0) {
        setDividerOffsetPx((prev) => (prev === 0 ? prev : 0));
        return;
      }

      const wwCenterY = wwRect.top + wwRect.height / 2;
      const mlCenterY = mlRect.top + mlRect.height / 2;
      const offsetPx = mlCenterY - wwCenterY;

      setDividerOffsetPx((prev) =>
        Math.abs(prev - offsetPx) < 0.5 ? prev : offsetPx
      );
    };

    update();

    const ro = new ResizeObserver(() => update());

    if (mainLayoutWrapperRef.current) {
      ro.observe(mainLayoutWrapperRef.current);
    }

    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activePage, sidebarEnabled]);

  return (
      <AppLayout
      windowWrapperRef={windowWrapperRef}
      isDragging={isDragging}
      loadingOverlay={
        importUiActive ? (
          <ImportTerminal
            progress={progress}
            progressMsg={progressMsg}
            batchTotal={batchTotal}
            batchDone={batchDone}
            batchCurrentFile={batchCurrentFile || ""}
            onAbort={handleAbort}
            commandLabel={batchCurrentFile || undefined}
            operation={activeOperation ?? "import"}
            detectionMethod={sceneDetectionMethod}
            importMethod={importMethodSetting}
            minimized={overlayMinimized}
            onToggleMinimize={() =>
              setMinimizeOverride((prev) => !(prev ?? autoMinimized))
            }
            onClose={handleAbortAndCloseBgProgress}
            bgBar={
              <BgProgressBar
                clipDone={(reencodeProgress ?? bgProgress)?.done ?? 0}
                clipTotal={(reencodeProgress ?? bgProgress)?.total ?? 0}
                clipLabel={reencodeProgress ? "Reencoding" : "Processing clips"}
                importDone={bgImportProgress?.done ?? 0}
                importTotal={bgImportProgress?.total ?? 0}
                webpDone={webpLoadDone}
                webpTotal={webpLoadTotal}
                onClose={handleAbortAndCloseBgProgress}
                attached
              />
            }
          />
        ) : (bgProgress || bgImportProgress || reencodeProgress || webpLoadTotal > 0) ? (
          <BgProgressBar
            clipDone={(reencodeProgress ?? bgProgress)?.done ?? 0}
            clipTotal={(reencodeProgress ?? bgProgress)?.total ?? 0}
            clipLabel={reencodeProgress ? "Reencoding" : "Processing clips"}
            importDone={bgImportProgress?.done ?? 0}
            importTotal={bgImportProgress?.total ?? 0}
            webpDone={webpLoadDone}
            webpTotal={webpLoadTotal}
            onClose={handleAbortAndCloseBgProgress}
          />
        ) : null
      }
      sidebarEnabled={sidebarEnabled}
      navbarProps={{
        setSidebarEnabled,
        sidebarEnabled,
        userHasHEVC,
        videoIsHEVC: useAppStateStore(s => s.videoIsHEVC),
      }}
      dividerProps={{
        onPointerDown: startSidebarResize,
        dividerOffsetPx,
        sidebarWidthPx,
      }}
    >
      <div className="main-content">
        <div style={{ display: activePage === "home" ? "contents" : "none" }}>
          <HomePage
            mainLayoutWrapperRef={mainLayoutWrapperRef}
          />
        </div>
        {activePage === "scenepacks" && generalSettings.scenepacksEnabled && <ScenepacksPage />}
      </div>
      <QuickMenu />
      <MenuModal />
      <SettingsModal
        onGeneralSettingsReset={handleResetGeneralSettings}
        onEpisodesPathChanged={remapEpisodePaths}
        onThemeReset={handleResetTheme}
      />
      {showStartupNotification && startupNotification ? (
        <StartupNotificationModal
          notification={startupNotification}
          onClose={handleCloseStartupNotification}
        />
      ) : null}
      <PostExportPassesModal />
      <AiInstallModal />
      </AppLayout>
  );
}

export default App;
