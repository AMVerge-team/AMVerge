// Root sidebar container. Composes SidebarNav and EpisodePanel, then passes sidebar-related props down
import SidebarNav from "./SidebarNav";
import EpisodePanel from "./episodePanel/EpisodePanel";

export default function Sidebar() {
  return (
    <div className="sidebar-container">
      <SidebarNav />
      <EpisodePanel />
    </div>
  );
}