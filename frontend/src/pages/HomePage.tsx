import { useEffect, useState, type RefObject } from "react";
import { FaCog } from "react-icons/fa";
import ImportButtons from "../components/ImportButtons";
import MainLayout from "../MainLayout";
import { fileNameFromPath } from "../utils/episodeUtils";
import { useAppStateStore } from "../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";
import { selectOverlayOpen, useUIStateStore } from "../stores/UIStore";

interface HomePageProps {
  mainLayoutWrapperRef: RefObject<HTMLDivElement | null>;
}

export default function HomePage({
  mainLayoutWrapperRef,
}: HomePageProps) {
  const openedEpisodeId = useEpisodePanelRuntimeStore(s => s.openedEpisodeId);
  const importedVideoPath = useAppStateStore(s => s.importedVideoPath);
  // This page stays mounted behind `display: none` on other pages. Scenepacks
  // mounts its own MainLayout over the same clip store, so the hidden preview
  // player has to stand down or both would play the clip's audio together.
  // The settings modal covers the page, so previews stand down while it is up.
  const isActivePage = useUIStateStore(s => s.activePage === "home" && !selectOverlayOpen(s));
  const openSettings = useUIStateStore(s => s.openSettings);

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
    <>
      <div
        className={intro ? "app-intro" : undefined}
        style={intro ? { ["--intro-delay" as any]: "0ms" } : undefined}
      >
        <ImportButtons />
      </div>

      <div className="main-layout-wrapper" ref={mainLayoutWrapperRef}>
        <MainLayout intro={intro} active={isActivePage} />

        <div
          className={`info-bar ${intro ? "app-intro" : ""}`}
          style={intro ? { ["--intro-delay" as any]: "260ms" } : undefined}
        >
          {openedEpisodeId && importedVideoPath && (
            <span className="info-bar-filename">
              {fileNameFromPath(importedVideoPath)}
            </span>
          )}

          <button
            type="button"
            className="settings-gear-button"
            onClick={() => openSettings()}
            aria-label="Settings"
            title="Settings"
          >
            <FaCog aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
