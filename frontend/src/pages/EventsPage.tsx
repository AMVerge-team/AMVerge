import { useEffect } from "react";
import { FaCog } from "react-icons/fa";

import MainLayout from "../MainLayout";
import Tooltip from "../components/common/Tooltip";
import EventsBrowser, { MAX_EVENT_COLUMNS } from "../components/events/EventsBrowser";
import EventsToolbar from "../components/events/EventsToolbar";
import { useEventsStore } from "../stores/eventsStore";
import { useUIStateStore } from "../stores/UIStore";

/**
 * Same frame as the clip pages — toolbar row, split layout with its divider,
 * info bar — with the events grid in place of the clip grid. The sidebar keeps
 * whichever panel was already open, and the preview pane stays where the user
 * left it but shows nothing, since there is no clip to preview here.
 */
export default function EventsPage() {
  const openSettings = useUIStateStore((s) => s.openSettings);
  const setCols = useUIStateStore((s) => s.setCols);
  const loadEvents = useEventsStore((s) => s.loadEvents);
  const refreshSession = useEventsStore((s) => s.refreshSession);

  useEffect(() => {
    void loadEvents();
    void refreshSession();
  }, [loadEvents, refreshSession]);

  // Arriving from a clip page zoomed out past this page's cap would leave the
  // navbar reading a column count the grid cannot show, so bring it into range
  // once on entry.
  useEffect(() => {
    setCols((previous) => Math.min(previous, MAX_EVENT_COLUMNS));
  }, [setCols]);

  return (
    <>
      <EventsToolbar />

      <div className="main-layout-wrapper">
        <MainLayout left={<EventsBrowser />} previewIdle />

        <div className="info-bar">
          <Tooltip content="Settings">
            <button
              type="button"
              className="settings-gear-button"
              onClick={() => openSettings()}
              aria-label="Settings"
            >
              <FaCog aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  );
}
