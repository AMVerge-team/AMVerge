import type { RefObject } from "react";
import ImportButtons from "../components/ImportButtons";
import MainLayout from "../MainLayout";
import { fileNameFromPath } from "../utils/episodeUtils";
import { useAppStateStore } from "../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";

interface HomePageProps {
  mainLayoutWrapperRef: RefObject<HTMLDivElement | null>;
}

export default function HomePage({
  mainLayoutWrapperRef,
}: HomePageProps) {
  const openedEpisodeId = useEpisodePanelRuntimeStore(s => s.openedEpisodeId);
  const importedVideoPath = useAppStateStore(s => s.importedVideoPath);

  return (
    <>
      <ImportButtons />

      <div className="main-layout-wrapper" ref={mainLayoutWrapperRef}>
        <MainLayout />

        <div className="info-bar">
          {openedEpisodeId && importedVideoPath && (
            <span className="info-bar-filename">
              {fileNameFromPath(importedVideoPath)}
            </span>
          )}
        </div>
      </div>
    </>
  );
}