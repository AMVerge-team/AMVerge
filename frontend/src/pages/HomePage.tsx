import { useEffect, useState } from "react";
import GridPageLayout from "../components/GridPageLayout";
import { fileNameFromPath } from "../utils/episodeUtils";
import { useAppStateStore } from "../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";
import { selectOverlayOpen, useUIStateStore } from "../stores/UIStore";

export default function HomePage() {
  const openedEpisodeId = useEpisodePanelRuntimeStore(s => s.openedEpisodeId);
  const importedVideoPath = useAppStateStore(s => s.importedVideoPath);
  // This page stays mounted behind `display: none` on other pages. Scenepacks
  // mounts its own MainLayout over the same clip store, so the hidden preview
  // player has to stand down or both would play the clip's audio together.
  // A modal covering the page counts the same way.
  const isActivePage = useUIStateStore(s => s.activePage === "home" && !selectOverlayOpen(s));

  // app-startup entrance: runs once on mount, then the classes are removed.
  // HomePage stays mounted across page switches behind a display:none wrapper,
  // and CSS animations replay when display is restored — dropping the classes
  // after the intro finishes keeps it a launch-only effect.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const timeout = window.setTimeout(() => setIntro(false), 1000);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <GridPageLayout
      active={isActivePage}
      intro={intro}
      infoText={
        openedEpisodeId && importedVideoPath
          ? fileNameFromPath(importedVideoPath)
          : null
      }
    />
  );
}
