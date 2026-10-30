// sidebar navigation buttons. handles switching between top-level pages like Home and Scenepacks
import type { IconType } from "react-icons";
import { FaCalendarAlt, FaLayerGroup, FaSearch } from "react-icons/fa";
import { IoLibrary } from "react-icons/io5";
import type { Page } from "./types";
import Tooltip from "../common/Tooltip";
import { useUIStateStore } from "../../stores/UIStore";
import { selectNewEventIds, useEventsStore } from "../../stores/eventsStore";
import { useFeature, type FeatureId } from "../../features/featureToggles";

const allButtons: { name: string; page: Page; icon: IconType; feature?: FeatureId }[] = [
  // shown as "Library"; the page id stays "home" so saved ui state keeps working
  { name: "Library", page: "home", icon: IoLibrary },
  { name: "Scenepacks", page: "scenepacks", icon: FaLayerGroup, feature: "scenepacks" },
  { name: "Scene Scout", page: "sceneScout", icon: FaSearch, feature: "sceneScout" },
  { name: "Community Events", page: "events", icon: FaCalendarAlt },
];

export default function SidebarNav() {
  const activePage = useUIStateStore(s => s.activePage);
  const setActivePage = useUIStateStore(s => s.setActivePage);
  const newEventCount = useEventsStore(s => selectNewEventIds(s).length);
  // a switched-off feature's tab is greyed out, or left out with "Hide disabled features"
  const features: Partial<Record<FeatureId, { enabled: boolean; hidden: boolean }>> = {
    scenepacks: useFeature("scenepacks"),
    sceneScout: useFeature("sceneScout"),
  };

  return (
    <div className="menu-buttons">
      {allButtons.map((button) => {
        const Icon = button.icon;
        const isActive = activePage === button.page;
        const feature = button.feature ? features[button.feature] : undefined;
        if (feature?.hidden) return null;
        const isFeatureOff = feature ? !feature.enabled : false;

        return (
          // on the row, since disabled buttons fire no pointer events
          <Tooltip
            key={button.page}
            content={isFeatureOff ? `Turn on ${button.name} in Settings › Features` : button.name}
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
                {button.page === "events" && newEventCount > 0 && (
                  <span className="sidebar-badge" aria-label={`${newEventCount} new events`}>
                    {newEventCount > 9 ? "9+" : newEventCount}
                  </span>
                )}
              </button>
            </div>
          </Tooltip>
        );
      })}

    </div>
  );
}
