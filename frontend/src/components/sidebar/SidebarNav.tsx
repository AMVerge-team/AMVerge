// sidebar navigation buttons. Handles switching between top-level pages like Home and Scenepacks
import type { IconType } from "react-icons";
import { FaCalendarAlt, FaHome, FaLayerGroup } from "react-icons/fa";
import type { Page } from "./types";
import Tooltip from "../common/Tooltip";
import { useUIStateStore } from "../../stores/UIStore";
import { useGeneralSettingsStore } from "../../stores/settingsStore";

const allButtons: { name: string; page: Page; icon: IconType; featureKey?: string }[] = [
  { name: "Home", page: "home", icon: FaHome },
  { name: "Scenepacks", page: "scenepacks", icon: FaLayerGroup, featureKey: "scenepacks" },
  { name: "Community Events", page: "events", icon: FaCalendarAlt },
];

export default function SidebarNav() {
  const activePage = useUIStateStore(s => s.activePage);
  const setActivePage = useUIStateStore(s => s.setActivePage);
  const scenepacksEnabled = useGeneralSettingsStore(s => s.scenepacksEnabled);

  return (
    <div className="menu-buttons">
      {allButtons.map((button) => {
        const Icon = button.icon;
        const isActive = activePage === button.page;
        const isFeatureOff = button.featureKey === "scenepacks" && !scenepacksEnabled;

        return (
          // the tooltip sits on the row rather than the button: the active and
          // feature-off buttons are disabled, and those fire no pointer events
          <Tooltip
            key={button.page}
            content={isFeatureOff ? "Enable Scenepacks in Settings" : button.name}
            side="right"
          >
            <div className="sidebar-button">
              <button
                type="button"
                className={`sidebar-nav-button${isActive ? " is-active" : ""}${isFeatureOff ? " is-feature-off" : ""}`}
                onClick={() => setActivePage(button.page)}
                disabled={isActive || isFeatureOff}
                aria-current={isActive ? "page" : undefined}
                aria-label={button.name}
              >
                <Icon aria-hidden="true" />
              </button>
            </div>
          </Tooltip>
        );
      })}

    </div>
  );
}
