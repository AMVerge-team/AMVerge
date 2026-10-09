import { useEffect, useMemo, useRef } from "react";
import { FaCog } from "react-icons/fa";

import MainLayout from "../MainLayout";
import Tooltip from "../components/common/Tooltip";
import SceneScoutToolbar from "../components/sceneScout/SceneScoutToolbar";
import SceneScoutHero from "../components/sceneScout/SceneScoutHero";
import { useAppStateStore } from "../stores/appStore";
import { useSceneScoutStore } from "../stores/sceneScoutStore";
import { selectOverlayOpen, useUIStateStore } from "../stores/UIStore";
import { hitToClipItem } from "../features/sceneScout/hitToClip";
import { useScoutThumbnailQueue } from "../features/sceneScout/useScoutThumbnailQueue";

export default function SceneScoutPage() {
  const overlayOpen = useUIStateStore(selectOverlayOpen);
  const openSettings = useUIStateStore((s) => s.openSettings);

  const results = useSceneScoutStore((s) => s.results);
  const refreshStatus = useSceneScoutStore((s) => s.refreshStatus);
  const heroDismissed = useSceneScoutStore((s) => s.heroDismissed);

  // the grid fades in only on the hero-to-top handoff, not on every tab switch
  const wasHeroRef = useRef(!heroDismissed);
  const revealGrid = wasHeroRef.current && heroDismissed;

  useScoutThumbnailQueue();

  // the grid is shared with the episode pages, so whatever was in it has to be
  // put back on the way out or leaving Scene Scout would blank the Home grid
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
      // selection is keyed by clip id and the ids differ per page, so anything
      // left selected here would keep inflating the episode grid's count
      state.setSelectedClips(new Set());
    };
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const clips = useMemo(() => results.map(hitToClipItem), [results]);

  useEffect(() => {
    const state = useAppStateStore.getState();
    state.setClips(clips);
    state.setImportedVideoPath(null);
    state.setImportToken(Date.now().toString());
    state.setSelectedClips(new Set());
    state.setFocusedClip(null);
    state.setFocusedClipId(null);
  }, [clips]);

  if (!heroDismissed) {
    return <SceneScoutHero />;
  }

  return (
    <>
      <SceneScoutToolbar />

      <div className={`main-layout-wrapper${revealGrid ? " scene-scout-reveal" : ""}`}>
        <MainLayout active={!overlayOpen} />

        <div className="info-bar">
          <Tooltip content="Options">
            <button
              type="button"
              className="settings-gear-button"
              onClick={() => openSettings()}
              aria-label="Options"
            >
              <FaCog aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  );
}
