// sidebar navigation buttons. handles switching between top-level pages like Home and Scenepacks
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import { FaCalendarAlt, FaLayerGroup, FaSearch } from '../icons/animated';
import { IoLibrary } from '../icons/animated';
import type { Page } from "./types";
import Tooltip from "../common/Tooltip";
import { useEscapeToClose } from "../common/useEscapeToClose";
import { useUIStateStore } from "../../stores/UIStore";
import { selectNewEventIds, useEventsStore } from "../../stores/eventsStore";
import { useContextMenuStore } from "../../stores/contextMenuStore";
import { useFeature, type FeatureId } from "../../features/featureToggles";

const allButtons: { nameKey: string; page: Page; icon: IconType; feature?: FeatureId }[] = [
  // shown as "Library"; the page id stays "home" so saved ui state keeps working
  { nameKey: "sidebar.library", page: "home", icon: IoLibrary },
  { nameKey: "sidebar.scenepacks", page: "scenepacks", icon: FaLayerGroup, feature: "scenepacks" },
  { nameKey: "sidebar.sceneScout", page: "sceneScout", icon: FaSearch, feature: "sceneScout" },
  { nameKey: "sidebar.events", page: "events", icon: FaCalendarAlt },
];

export default function SidebarNav() {
  const { t } = useTranslation("shell");
  const activePage = useUIStateStore(s => s.activePage);
  const setActivePage = useUIStateStore(s => s.setActivePage);
  const newEventCount = useEventsStore(s => selectNewEventIds(s).length);
  const notificationsMuted = useEventsStore(s => s.notificationsMuted);
  const setNotificationsMuted = useEventsStore(s => s.setNotificationsMuted);
  const claimMenu = useContextMenuStore(s => s.openContextMenu);
  const activeContextMenu = useContextMenuStore(s => s.activeMenu);
  const [eventsMenu, setEventsMenu] = useState<{ x: number; y: number } | null>(null);
  // a switched-off feature's tab is greyed out, or left out with "Hide disabled features"
  const features: Partial<Record<FeatureId, { enabled: boolean; hidden: boolean }>> = {
    scenepacks: useFeature("scenepacks"),
    sceneScout: useFeature("sceneScout"),
  };

  // another menu took the slot, so this one is stale
  useEffect(() => {
    if (activeContextMenu !== "sidebar-events") setEventsMenu(null);
  }, [activeContextMenu]);

  // contextmenu as well as click: a right-click fires no click event
  useEffect(() => {
    if (!eventsMenu) return;
    const close = () => setEventsMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [eventsMenu]);

  useEscapeToClose(() => setEventsMenu(null), eventsMenu !== null);

  const openEventsMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    claimMenu("sidebar-events");
    setEventsMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="menu-buttons">
      {allButtons.map((button) => {
        const Icon = button.icon;
        const name = t(button.nameKey);
        const isActive = activePage === button.page;
        const feature = button.feature ? features[button.feature] : undefined;
        if (feature?.hidden) return null;
        const isFeatureOff = feature ? !feature.enabled : false;

        return (
          // on the row, since disabled buttons fire no pointer events
          <Tooltip
            key={button.page}
            content={isFeatureOff ? t("features.turnOn", { feature: name }) : name}
            side="right"
          >
            <div
              className="sidebar-button"
              onContextMenu={button.page === "events" ? openEventsMenu : undefined}
            >
              <button
                type="button"
                className={`sidebar-nav-button${isActive ? " is-active" : ""}${isFeatureOff ? " is-feature-off" : ""}`}
                onClick={() => setActivePage(button.page)}
                disabled={isActive || isFeatureOff}
                aria-current={isActive ? "page" : undefined}
                aria-label={name}
              >
                <Icon aria-hidden="true" />
                {button.page === "events" && newEventCount > 0 && !notificationsMuted && (
                  <span className="sidebar-badge" aria-label={t("sidebar.newEvents", { count: newEventCount })}>
                    {newEventCount > 9 ? "9+" : newEventCount}
                  </span>
                )}
              </button>
            </div>
          </Tooltip>
        );
      })}

      {eventsMenu && (
        <div
          className="episode-context-menu"
          style={{ left: eventsMenu.x, top: eventsMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="episode-context-menu-item"
            onClick={() => {
              setNotificationsMuted(!notificationsMuted);
              setEventsMenu(null);
            }}
          >
            {notificationsMuted ? t("sidebar.unmuteEvents") : t("sidebar.muteEvents")}
          </button>
        </div>
      )}
    </div>
  );
}
