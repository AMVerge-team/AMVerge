import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Event, listen } from "@tauri-apps/api/event";
import { DEFAULT_GENERAL_SETTINGS } from "./stores/settingsStore";

import AppLayout from "./components/AppLayout";
import HomePage from "./pages/HomePage";
import SettingsModal from "./components/settings/SettingsModal";
import QuickMenu from "./components/QuickMenu";
import CommandPalette from "./components/CommandPalette";
import MenuModal from "./components/menu/MenuModal";
import EventsPage from "./pages/EventsPage";
import HostEventModal from "./components/events/HostEventModal";
import BanNoticeModal from "./components/events/BanNoticeModal";
import DenialNoticeModal from "./components/events/DenialNoticeModal";
import ApprovalNoticeModal from "./components/events/ApprovalNoticeModal";
import ScenepacksPage from "./pages/ScenepacksPage";
import SceneScoutPage from "./pages/SceneScoutPage";
import ImportTerminal from "./components/ImportTerminal";
import BgProgressBar from "./components/BgProgressBar";
import StartupNotificationModal, { type StartupNotification } from "./components/StartupNotificationModal";
import { V1ImportNotice } from "./components/V1ImportNotice";
import SplashScreen from "./components/SplashScreen";
import PostExportPassesModal from "./components/PostExportPassesModal";
import AiInstallModal from "./components/AiInstallModal";
import ProcessConflictModal from "./components/ProcessConflictModal";
import { registerProcessAbort } from "./features/processes/singleProcess";
import { clearReencodeQueue } from "./features/import/reencodeQueue";

import useDiscordRPC from "./hooks/useDiscordRPC";
import useHEVCSupport from "./hooks/useHEVCSupport";
import useDragDropImport from "./hooks/useDragDropImport";
import useImportExport from "./hooks/useImportExport";
import useStartupUpdateNotification from "./hooks/useStartupUpdateNotification";
import useExtensionSync from "./hooks/useExtensionSync";
import useDiscordAuth from "./hooks/useDiscordAuth";
import useEventsWatch from "./hooks/useEventsWatch";

import { remapClipPaths, remapPathRoot } from "./utils/episodeUtils";
import { useScenePreviewStore } from "./stores/scenePreviewStore";

import { useAiDepsStore } from "./stores/aiDepsStore";
import { useAppStateStore } from "./stores/appStore";
import { useWebpLoadingStore } from "./stores/webpLoadingStore";
import { useSceneScoutStore } from "./stores/sceneScoutStore";
import { useUIStateStore } from "./stores/UIStore";
import { applyThemeSettings, useGeneralSettingsStore, useThemeSettingsStore } from "./stores/settingsStore";
import { useEpisodePanelRuntimeStore } from "./stores/episodeStore";

/**
 * shove the sidebar divider left of this and the sidebar folds away, the same
 * gesture the preview pane answers to on the other side of the grid. sits well
 * under the 220px minimum width, so brushing the stop does not dismiss it.
 */
const SIDEBAR_COLLAPSE_BELOW_PX = 140;


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
  const reencodeQueueLength = useAppStateStore((s) => s.reencodeQueue.length);
  // scene scout indexing reports two counted stages, so the card names whichever is running
  const scoutIndexStage = useSceneScoutStore((s) => s.indexing?.stage);
  const scoutAddLabel = scoutIndexStage === "sampling" ? "Sampling frames" : "Embedding scenes";
  const webpLoadDone = useWebpLoadingStore((s) => s.done);
  const webpLoadTotalRaw = useWebpLoadingStore((s) => s.total);
  const webpDismissed = useWebpLoadingStore((s) => s.dismissed);
  // closing the card hides the preview counter for the rest of this episode;
  // the queue keeps filling the cache in the background
  const webpLoadTotal = webpDismissed ? 0 : webpLoadTotalRaw;

  const aiStage = useAiDepsStore((s) => s.stage);
  const aiPercent = useAiDepsStore((s) => s.percent);
  const aiModalOpen = useAiDepsStore((s) => s.open);
  const aiPack = useAiDepsStore((s) => s.pack);
  const aiInstalling = aiStage === "installing";
  const aiPackName = aiPack ? (aiPack === "ml" ? "AI Scene Detection" : aiPack === "interpolation" ? "AI Interpolation" : aiPack === "depth" ? "Depth Maps" : "AI Models") : "AI Models";

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


  const windowWrapperRef = useRef<HTMLDivElement | null>(null);
  const userHasHEVC = useAppStateStore((s) => s.userHasHEVC);
  const abortedRef = useRef(false);

  const scenepacksEnabled = useGeneralSettingsStore((s) => s.scenepacksEnabled);
  const sceneScoutEnabled = useGeneralSettingsStore((s) => s.sceneScoutEnabled);

  const [splashVisible, setSplashVisible] = useState(true);

  // hide every background layer while the splash is up, so the gradient and any
  // wallpaper fade in with the app rather than being there all along. before
  // paint, or the first frame shows the background at full strength
  useLayoutEffect(() => {
    document.body.style.setProperty("--app-bg-reveal", "0");
  }, []);

  const handleSplashFinished = useCallback(() => {
    setSplashVisible(false);
    // the transition on body carries it the rest of the way
    document.body.style.setProperty("--app-bg-reveal", "1");
  }, []);
  const themeSettings = useThemeSettingsStore();


  const sidebarEnabled = useUIStateStore(s => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore(s => s.setSidebarEnabled);
  const activePage = useUIStateStore(s => s.activePage);
  const isDragging = useUIStateStore(s => s.isDragging);

  const handleResetGeneralSettings = async () => {
    try {
      // release the clip files the grid holds open, or Windows blocks the move
      // of anything currently on screen
      useAppStateStore.getState().setClips([]);
      useAppStateStore.getState().setSelectedClips(new Set());
      await new Promise((resolve) => setTimeout(resolve, 250));

      const resolvedOldPath = await invoke<string>("move_storage_to_new_dir", {
        oldDir: useGeneralSettingsStore.getState().episodesPath,
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

  const [startupNotification, setStartupNotification] = useState<StartupNotification | null>(null);
  const [showStartupNotification, setShowStartupNotification] = useState(false);
  const startupUpdateNotification = useStartupUpdateNotification();
  useExtensionSync();
  // mounted at app level: the browser round-trip can finish after the events
  // modal is closed, and the result still has to land somewhere
  useDiscordAuth();
  // polls in the background so a newly approved event badges the sidebar
  // without the user opening the page first
  useEventsWatch();

  const parseThumbnailProgress = (message: string): { done: number; total: number } | null => {
    const match = message.match(/generating thumbnails\.\.\.\s*(\d+)\s*\/\s*(\d+)/i);
    if (!match) return null;

    const done = Number.parseInt(match[1], 10);
    const total = Number.parseInt(match[2], 10);
    if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;

    return { done: Math.max(0, done), total };
  };

  const sidebarWidthPx = useUIStateStore(s => s.sidebarWidthPx);
  const setSidebarWidthPx = useUIStateStore(s => s.setSidebarWidthPx);

  function startSidebarResize(e: React.PointerEvent<HTMLDivElement>) {
    const wrapper = windowWrapperRef.current;
    if (!wrapper) return;

    e.preventDefault();
    e.stopPropagation();

    const pointerId = e.pointerId;
    const divider = e.currentTarget;
    divider.setPointerCapture(pointerId);
    document.body.classList.add("is-resizing-sidebar");

    const onPointerMove = (ev: PointerEvent) => {
      const rect = wrapper.getBoundingClientRect();
      const minWidth = 220;
      const maxWidth = Math.max(minWidth, Math.floor(rect.width * 0.6));
      const proposed = Math.round(ev.clientX - rect.left);

      // past the last stop the sidebar folds away, live, and pulling back right
      // brings it straight back. folded, the divider stays at the window's left
      // edge, so the sidebar can be dragged back out from there too
      if (proposed < SIDEBAR_COLLAPSE_BELOW_PX) {
        setSidebarEnabled(false);
        return;
      }
      setSidebarEnabled(true);

      setSidebarWidthPx(Math.min(maxWidth, Math.max(minWidth, proposed)));
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

  const { updateRPC } = useDiscordRPC();

  const { handleImport, handleBatchImport } = useImportExport({
    abortedRef,
    onRPCUpdate: updateRPC
  });

  useHEVCSupport();

  useDragDropImport({
    handleImport,
    handleBatchImport
  });

  async function handleAbort() {
    abortedRef.current = true;
    // emptied first, so the resume stopped below does not start the next episode
    clearReencodeQueue();

    try {
      await Promise.allSettled([
        invoke("abort_detect_scenes"),
        invoke("abort_export"),
        invoke("abort_editor_import"),
        invoke("abort_scout_index"),
        invoke("abort_resume_episode"),
      ]);
    } catch (err) {
      console.error("abort tasks failed:", err);
    }
  }

  // the queue counts between its episodes too, so the mini window does not close and reopen
  const bgActive =
    !!(bgProgress || bgImportProgress || reencodeProgress) || reencodeQueueLength > 0 || webpLoadTotal > 0;
  const [importUiActive, setImportUiActive] = useState(false);
  // null = follow auto behaviour; true/false = user's explicit minimize choice
  const [minimizeOverride, setMinimizeOverride] = useState<boolean | null>(null);

  useEffect(() => {
    void useAiDepsStore.getState().refresh();
  }, []);

  const resumingEpisodeId = useAppStateStore((s) => s.resumingEpisodeId);
  const resumingEpisodeName = useEpisodePanelRuntimeStore(
    (s) => s.episodes.find((e) => e.id === resumingEpisodeId)?.displayName
  );

  useEffect(() => {
    if (loading) setImportUiActive(true);
  }, [loading]);
  // a resumed episode brings the CLI mini window back (minimized, since only background work runs)
  useEffect(() => {
    if (resumingEpisodeId) setImportUiActive(true);
  }, [resumingEpisodeId]);
  // a webp episode's previews show in the same window, not the old standalone card
  useEffect(() => {
    if (webpLoadTotal > 0) setImportUiActive(true);
  }, [webpLoadTotal]);

  // previews are the only work left: the window reports them as its own job
  const previewsOnly =
    webpLoadTotal > 0 &&
    !loading &&
    !activeOperation &&
    !resumingEpisodeId &&
    !bgProgress &&
    !bgImportProgress &&
    !reencodeProgress &&
    reencodeQueueLength === 0;
  const openedEpisodeName = useEpisodePanelRuntimeStore(
    (s) => s.episodes.find((e) => e.id === s.openedEpisodeId)?.displayName
  );
  useEffect(() => {
    if (!loading && !bgActive) {
      setImportUiActive(false);
      setMinimizeOverride(null);
    }
  }, [loading, bgActive]);

  // auto-minimize once the heavy phase (scene detect + first clip cuts) is done
  // and only background thumbnail/reencode/preview work remains
  const scoutOperation =
    activeOperation === "scout_add" ||
    activeOperation === "scout_open" ||
    activeOperation === "scout_search" ||
    activeOperation === "scout_thumbnails";
  const autoMinimized = scoutOperation || (!loading && bgActive);
  const overlayMinimized = minimizeOverride !== null ? minimizeOverride : autoMinimized;

  async function handleAbortAndCloseBgProgress() {
    const { bgProgress: bg, bgImportProgress: bgImport, reencodeProgress: reenc, activeOperation: op } =
      useAppStateStore.getState();
    if (bg || bgImport || reenc || op === "scout_add" || op === "scout_open" || op === "scout_search" || op === "scout_thumbnails") {
      await handleAbort();
    }
    const pauseWebps = pauseWebpGeneration();
    clearBgProgress();
    pauseWebps();
  }

  // closing the card pauses webp previews still to make, like closing an import; the episode row resumes them
  function pauseWebpGeneration(): () => void {
    const { total, done } = useWebpLoadingStore.getState();
    const episodeId = useEpisodePanelRuntimeStore.getState().openedEpisodeId;
    return () => {
      if (total > done) useWebpLoadingStore.getState().pause(episodeId);
    };
  }

  // "stop it and continue" in ProcessConflictModal: the same stop the progress window's ✕ does
  useEffect(() => {
    registerProcessAbort(async () => {
      await handleAbort();
      const pauseWebps = pauseWebpGeneration();
      clearBgProgress();
      pauseWebps();
    });
  });

  useEffect(() => {
    applyThemeSettings(themeSettings);
  }, [themeSettings]);

  // keeps the AI env's cli on the newest compatible patch; delayed so it never competes with startup
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const timer = window.setTimeout(() => {
      invoke<{ status: string; installed?: string | null; latest?: string | null; message?: string | null }>(
        "update_ai_cli"
      )
        .then((r) => {
          if (r.status === "updated") {
            console.info(`AI CLI updated ${r.installed ?? "?"} -> ${r.latest ?? "?"}`);
          } else if (r.status === "failed") {
            console.warn(`AI CLI update failed, staying on ${r.installed ?? "?"}: ${r.message ?? ""}`);
          }
        })
        .catch((err) => console.warn("AI CLI update check failed", err));
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, []);

  // a page whose feature was switched off in Settings > Features sends the user back to the library
  useEffect(() => {
    if ((activePage === "scenepacks" && !scenepacksEnabled) || (activePage === "sceneScout" && !sceneScoutEnabled)) {
      useUIStateStore.getState().setActivePage("home");
    }
  }, [activePage, scenepacksEnabled, sceneScoutEnabled]);

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

  // shared by the bar attached to the mini window and the standalone one
  const clipProgress = reencodeProgress ?? bgProgress;
  const clipLabel =
    activeOperation === "scout_add" ? scoutAddLabel
    : activeOperation === "scout_search" ? "Searching scenes"
    : activeOperation === "scout_thumbnails" ? "Generating thumbnails"
    : reencodeProgress ? "Reencoding"
    : "Processing clips";

  return (
      <AppLayout
      windowWrapperRef={windowWrapperRef}
      isDragging={isDragging}
      loadingOverlay={
        importUiActive ? (
          <ImportTerminal
            progress={previewsOnly ? Math.round((webpLoadDone / webpLoadTotal) * 100) : progress}
            progressMsg={previewsOnly ? `Generating previews ${webpLoadDone}/${webpLoadTotal}` : progressMsg}
            batchTotal={batchTotal}
            batchDone={batchDone}
            batchCurrentFile={batchCurrentFile || ""}
            // abort on previews pauses them, the same as closing the window
            onAbort={previewsOnly ? handleAbortAndCloseBgProgress : handleAbort}
            commandLabel={batchCurrentFile || resumingEpisodeName || (previewsOnly ? openedEpisodeName : undefined) || undefined}
            operation={activeOperation ?? (resumingEpisodeId ? "resume" : previewsOnly ? "previews" : "import")}
            detectionMethod={sceneDetectionMethod}
            importMethod={importMethodSetting}
            minimized={overlayMinimized}
            onToggleMinimize={() =>
              setMinimizeOverride((prev) => !(prev ?? autoMinimized))
            }
            onClose={handleAbortAndCloseBgProgress}
            bgBar={
              <BgProgressBar
                clipDone={clipProgress?.done ?? 0}
                clipTotal={clipProgress?.total ?? 0}
                clipLabel={clipLabel}
                importDone={bgImportProgress?.done ?? 0}
                importTotal={bgImportProgress?.total ?? 0}
                webpDone={webpLoadDone}
                // the window's own bar already shows previews when they are the job
                webpTotal={previewsOnly ? 0 : webpLoadTotal}
                onClose={handleAbortAndCloseBgProgress}
                attached
              />
            }
          />
        ) : (bgProgress || bgImportProgress || reencodeProgress || webpLoadTotal > 0 || (aiInstalling && !aiModalOpen)) ? (
          <BgProgressBar
            clipDone={clipProgress?.done ?? 0}
            clipTotal={clipProgress?.total ?? 0}
            clipLabel={clipLabel}
            importDone={bgImportProgress?.done ?? 0}
            importTotal={bgImportProgress?.total ?? 0}
            webpDone={webpLoadDone}
            webpTotal={webpLoadTotal}
            aiDone={aiPercent}
            aiTotal={aiInstalling && !aiModalOpen ? 100 : 0}
            aiLabel={`Downloading ${aiPackName}`}
            onAiClick={() => useAiDepsStore.getState().openModal()}
            onClose={() => {
              if (aiInstalling && !aiModalOpen) {
                useAiDepsStore.getState().cancel();
              }
              handleAbortAndCloseBgProgress();
            }}
          />
        ) : null
      }
      sidebarEnabled={sidebarEnabled}
      navbarProps={{
        userHasHEVC,
        videoIsHEVC: useAppStateStore(s => s.videoIsHEVC),
      }}
      dividerProps={{
        onPointerDown: startSidebarResize,
        sidebarWidthPx,
      }}
    >
      <div className="main-content">
        <div style={{ display: activePage === "home" ? "contents" : "none" }}>
          <HomePage />
        </div>
        {activePage === "scenepacks" && scenepacksEnabled && <ScenepacksPage />}
        {activePage === "sceneScout" && sceneScoutEnabled && <SceneScoutPage />}
        {activePage === "events" && <EventsPage />}
      </div>
      <QuickMenu />
      <ProcessConflictModal />
      <CommandPalette />
      <MenuModal />
      <HostEventModal />
      <BanNoticeModal />
      <DenialNoticeModal />
      <ApprovalNoticeModal />
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
      {splashVisible ? null : <V1ImportNotice />}
      {splashVisible ? <SplashScreen onFinished={handleSplashFinished} /> : null}
      </AppLayout>
  );
}

export default App;
