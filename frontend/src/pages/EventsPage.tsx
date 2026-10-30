import { useEffect } from "react";

import MainLayout from "../MainLayout";
import EventsBrowser, { MAX_EVENT_COLUMNS } from "../components/events/EventsBrowser";
import EventsToolbar from "../components/events/EventsToolbar";
import { useEventsStore } from "../stores/eventsStore";
import { useUIStateStore } from "../stores/UIStore";

/** the clip pages' frame with the events grid; sidebar and preview pane stay as they were */
export default function EventsPage() {
  const setCols = useUIStateStore((s) => s.setCols);
  const loadEvents = useEventsStore((s) => s.loadEvents);
  const refreshSession = useEventsStore((s) => s.refreshSession);

  useEffect(() => {
    void loadEvents();
    void refreshSession();
  }, [loadEvents, refreshSession]);

  // clamps a column count above this page's cap once on entry
  useEffect(() => {
    setCols((previous) => Math.min(previous, MAX_EVENT_COLUMNS));
  }, [setCols]);

  return (
    <>
      <EventsToolbar />

      <div className="main-layout-wrapper">
        {/* keeps the pane and divider so the split does not jump when moving
            between Events and the clip pages. `previewIdle` still blanks the
            player, since there is no clip in context here and a leftover one
            would keep playing its audio while you browse events */}
        <MainLayout left={<EventsBrowser />} previewIdle />

        <div className="info-bar" />
      </div>
    </>
  );
}
