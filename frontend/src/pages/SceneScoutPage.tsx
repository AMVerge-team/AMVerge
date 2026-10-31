import { useEffect, useMemo, useRef, type ReactNode } from "react";
import MainLayout from "../MainLayout";
import SceneScoutToolbar from "../components/sceneScout/SceneScoutToolbar";
import SceneScoutHero from "../components/sceneScout/SceneScoutHero";
import { SceneScoutSearchView } from "../components/sceneScout/SceneScoutSearchView";
import { SceneScoutFlowToolbar } from "../components/sceneScout/flow/SceneScoutFlowToolbar";
import { SceneScoutFlowView } from "../components/sceneScout/flow/SceneScoutFlowView";
import { MissingEpisodePrompt } from "../components/sceneScout/MissingEpisodePrompt";
import { SceneScoutTour } from "../components/sceneScout/SceneScoutTour";
import { useAppStateStore } from "../stores/appStore";
import { useSceneScoutStore } from "../stores/sceneScoutStore";
import { selectOverlayOpen, useUIStateStore } from "../stores/UIStore";
import { hitToClipItem } from "../features/sceneScout/hitToClip";
import { useScoutThumbnailQueue } from "../features/sceneScout/useScoutThumbnailQueue";
import { useScoutPreviewPrefetch } from "../features/sceneScout/useScoutPreviewPrefetch";

export default function SceneScoutPage() {
  const overlayOpen = useUIStateStore(selectOverlayOpen);

  const mode = useSceneScoutStore((s) => s.mode);
  const searchResults = useSceneScoutStore((s) => s.results);
  const flowResults = useSceneScoutStore((s) => s.flowResults);
  const results = mode === "flow" ? flowResults : searchResults;
  const refreshStatus = useSceneScoutStore((s) => s.refreshStatus);
  const heroDismissed = useSceneScoutStore((s) => s.heroDismissed);
  const tourSeen = useUIStateStore((s) => s.sceneScoutTourSeen);

  useScoutThumbnailQueue();

  // the grid is shared with home, so its clips are restored on the way out
  const prevClipsRef = useRef<ReturnType<typeof useAppStateStore.getState>["clips"] | null>(null);
  const prevVideoPathRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      const state = useAppStateStore.getState();
      prevClipsRef.current = state.clips;
      prevVideoPathRef.current = state.importedVideoPath;
      mountedRef.current = true;
    }

    return () => {
      const state = useAppStateStore.getState();
      state.setClips(prevClipsRef.current ?? []);
      state.setImportedVideoPath(prevVideoPathRef.current);
      state.setImportToken(Date.now().toString());
      state.setFocusedClip(null);
      state.setFocusedClipId(null);
      // clip ids differ per page, so a leftover selection would inflate home's count
      state.setSelectedClips(new Set());
    };
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const clips = useMemo(() => results.map(hitToClipItem), [results]);
  useScoutPreviewPrefetch(clips);

  useEffect(() => {
    const state = useAppStateStore.getState();
    state.setClips(clips);
    state.setImportedVideoPath(null);
    state.setImportToken(Date.now().toString());
    state.setSelectedClips(new Set());
    state.setFocusedClip(null);
    state.setFocusedClipId(null);
  }, [clips]);

  // both tabs show the centered layout until the session's first search or flow
  const firstVisit = !heroDismissed;

  // an empty toolbar row keeps the preview pane at home's height on the first-visit layout
  let toolbar: ReactNode = <div className="clips-import grid-toolbar" aria-hidden="true" />;
  let left: ReactNode;
  if (firstVisit) left = <SceneScoutHero />;
  else if (mode === "flow") {
    toolbar = <SceneScoutFlowToolbar />;
    left = <SceneScoutFlowView />;
  } else {
    toolbar = <SceneScoutToolbar />;
    left = <SceneScoutSearchView />;
  }

  return (
    <>
      {toolbar}

      <div className="main-layout-wrapper">
        <MainLayout active={!overlayOpen} left={left} />

        <div className="info-bar" />
      </div>

      <MissingEpisodePrompt />
      {!tourSeen && !overlayOpen && <SceneScoutTour />}
    </>
  );
}
