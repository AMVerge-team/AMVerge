// root sidebar container. composes SidebarNav, conditionally renders EpisodePanel or ScenepacksPanel
import SidebarNav from "./SidebarNav";
import EpisodePanel from "./episodePanel/EpisodePanel";
import { ScenepacksPanel } from "./scenepacks/ScenepacksPanel";
import SceneScoutPanel from "../sceneScout/SceneScoutPanel";
import { useUIStateStore } from "../../stores/UIStore";

export default function Sidebar() {
  // panelPage, not activePage: Events has no panel and leaves the open one in place
  const panelPage = useUIStateStore((s) => s.panelPage);

  return (
    <div className="sidebar-container">
      <SidebarNav />
      {panelPage === "scenepacks" ? (
        <ScenepacksPanel />
      ) : panelPage === "sceneScout" ? (
        <SceneScoutPanel />
      ) : (
        <EpisodePanel />
      )}
    </div>
  );
}