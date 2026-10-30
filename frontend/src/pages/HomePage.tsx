import { useEffect, useState } from "react";
import GridPageLayout from "../components/GridPageLayout";
import { fileNameFromPath } from "../utils/episodeUtils";
import { useAppStateStore } from "../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";
import { selectOverlayOpen, useUIStateStore } from "../stores/UIStore";

export default function HomePage() {
  const openedEpisodeId = useEpisodePanelRuntimeStore(s => s.openedEpisodeId);
  const importedVideoPath = useAppStateStore(s => s.importedVideoPath);
  // stays mounted behind display:none, so its player stands down on other pages or under a modal
  const isActivePage = useUIStateStore(s => s.activePage === "home" && !selectOverlayOpen(s));

  // launch-only entrance: the classes drop after the intro, or display:none page switches would replay it
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
