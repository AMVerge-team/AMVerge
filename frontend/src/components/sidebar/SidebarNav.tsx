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
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { isPackInstalled } from "../../features/aiDeps/packs";
import { ConfirmModal } from "../settings/general/ConfirmModal";
import { selectNewEventIds, useEventsStore } from "../../stores/eventsStore";
import { useContextMenuStore } from "../../stores/contextMenuStore";
import { featureDef, useFeature, type FeatureId } from "../../features/featureToggles";

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
  const aiStatus = useAiDepsStore(s => s.status);
  const [eventsMenu, setEventsMenu] = useState<{ x: number; y: number } | null>(null);
  const [enablePrompt, setEnablePrompt] = useState<{ id: FeatureId; name: string; page: Page } | null>(null);
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

  const handleNavClick = async (button: (typeof allButtons)[number], isFeatureOff: boolean) => {
    if (!isFeatureOff || !button.feature) {
      setActivePage(button.page);
      return;
    }

    if (button.feature === "sceneScout") {
      const status = useAiDepsStore.getState().status ?? (await useAiDepsStore.getState().refresh());
      if (status?.managed && !isPackInstalled(status, "scout")) {
        const installed = await useAiDepsStore.getState().ensurePack("scout");
        if (installed) {
          useGeneralSettingsStore.setState({ sceneScoutEnabled: true });
          setActivePage("sceneScout");
        }
        return;
      }
    }

    setEnablePrompt({ id: button.feature, name: t(button.nameKey), page: button.page });
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
        const needsScoutInstall =
          button.feature === "sceneScout" &&
          isFeatureOff &&
          Boolean(aiStatus?.managed) &&
          !isPackInstalled(aiStatus, "scout");

        return (
          <Tooltip
            key={button.page}
            content={
              isFeatureOff
                ? needsScoutInstall
                  ? t("release202:installScout")
                  : t("release202:enableFeature", { name })
                : name
            }
            side="right"
          >
            <div
              className="sidebar-button"
              data-getting-started={`nav-${button.page}`}
              onContextMenu={button.page === "events" ? openEventsMenu : undefined}
            >
              <button
                type="button"
                className={`sidebar-nav-button${isActive ? " is-active" : ""}${isFeatureOff ? " is-feature-off" : ""}`}
                onClick={() => void handleNavClick(button, isFeatureOff)}
                disabled={isActive}
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
      {enablePrompt && (
        <ConfirmModal
          title={t("release202:enableTitle", { name: enablePrompt.name })}
          message={t("release202:enableMessage", { name: enablePrompt.name })}
          confirmLabel={t("release202:enable")}
          onClose={() => setEnablePrompt(null)}
          onConfirm={() => {
            const setting = featureDef(enablePrompt.id).setting;
            useGeneralSettingsStore.setState({ [setting]: true });
            setActivePage(enablePrompt.page);
            setEnablePrompt(null);
          }}
        />
      )}
    </div>
  );
}
