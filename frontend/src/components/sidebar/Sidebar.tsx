// root sidebar container. composes SidebarNav, conditionally renders EpisodePanel or ScenepacksPanel
import SidebarNav from "./SidebarNav";
import EpisodePanel from "./episodePanel/EpisodePanel";
import { ScenepacksPanel } from "./scenepacks/ScenepacksPanel";
import { useUIStateStore } from "../../stores/UIStore";

export default function Sidebar() {
  // panelPage, not activePage: the Events page has no panel of its own and
  // leaves whichever one was already open in place
  const panelPage = useUIStateStore((s) => s.panelPage);

  return (
    <div className="sidebar-container">
      <SidebarNav />
      {panelPage === "scenepacks" ? <ScenepacksPanel /> : <EpisodePanel />}
    </div>
  );
}