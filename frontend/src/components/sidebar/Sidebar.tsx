// root sidebar container. Composes SidebarNav, conditionally renders EpisodePanel or ScenepacksPanel
import SidebarNav from "./SidebarNav";
import EpisodePanel from "./episodePanel/EpisodePanel";
import { ScenepacksPanel } from "./scenepacks/ScenepacksPanel";
import { useUIStateStore } from "../../stores/UIStore";

export default function Sidebar() {
  const activePage = useUIStateStore((s) => s.activePage);

  return (
    <div className="sidebar-container">
      <SidebarNav />
      {activePage === "scenepacks" ? <ScenepacksPanel /> : <EpisodePanel />}
    </div>
  );
}