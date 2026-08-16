// sidebar navigation buttons. Handles switching between top-level pages like Home and Menu
import type { IconType } from "react-icons";
import { FaBars, FaCog, FaHome, FaLayerGroup } from "react-icons/fa";
import type { Page } from "./types";
import { useUIStateStore } from "../../stores/UIStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";

const allButtons: { name: string; page: Page; icon: IconType; featureKey?: string }[] = [
  { name: "Home", page: "home", icon: FaHome },
  { name: "Scenepacks", page: "scenepacks", icon: FaLayerGroup, featureKey: "scenepacks" },
  { name: "Menu", page: "menu", icon: FaBars },
  { name: "Settings", page: "settings", icon: FaCog },
];

export default function SidebarNav() {
  const activePage = useUIStateStore(s => s.activePage);
  const setActivePage = useUIStateStore(s => s.setActivePage);
  const scenepacksEnabled = useGeneralSettingsStore(s => s.scenepacksEnabled);

  const buttons = allButtons.filter((b) => {
    if (b.featureKey === "scenepacks") return scenepacksEnabled;
    return true;
  });

  const colCount = buttons.length;

  return (
    <div className="menu-buttons" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
      {buttons.map((button) => {
        const Icon = button.icon;
        const isActive = activePage === button.page;

        return (
          <div className="sidebar-button" key={button.page}>
            <button
              type="button"
              className={`sidebar-nav-button${isActive ? " is-active" : ""}`}
              onClick={() => setActivePage(button.page)}
              disabled={isActive}
              aria-current={isActive ? "page" : undefined}
              aria-label={button.name}
              title={button.name}
            >
              <Icon aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
