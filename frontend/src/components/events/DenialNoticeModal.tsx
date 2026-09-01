import { useMemo } from "react";
import { FaEdit, FaExclamationTriangle } from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import { useEventsStore } from "../../stores/eventsStore";
import { useUIStateStore } from "../../stores/UIStore";

/**
 * Shown once when a moderator denies one of the host's events, so a denial is
 * not something they have to go looking for. Dismissing marks it seen
 * server-side, so it does not reappear on the next launch or another machine.
 */
export default function DenialNoticeModal() {
  const mine = useEventsStore((s) => s.mine);
  const dismiss = useEventsStore((s) => s.dismissDenialNotice);
  const openHostForm = useEventsStore((s) => s.openHostForm);
  const setActivePage = useUIStateStore((s) => s.setActivePage);

  const denied = useMemo(
    () => mine.filter((event) => event.status === "denied" && event.denialSeen === false),
    [mine]
  );

  if (denied.length === 0) return null;

  const first = denied[0];

  return (
    <ModalShell
      open
      onClose={dismiss}
      label="Event denied"
      className="denial-notice-modal"
    >
      <div className="denial-notice">
        <FaExclamationTriangle aria-hidden="true" className="denial-notice-icon" />

        <h2>
          {denied.length === 1
            ? "Your event was not approved"
            : `${denied.length} of your events were not approved`}
        </h2>

        <ul className="denial-notice-list">
          {denied.map((event) => (
            <li key={event.id}>
              <span className="denial-notice-title">{event.title}</span>
              <span className="denial-notice-reason">
                {event.denialReason || "No reason was given."}
              </span>
            </li>
          ))}
        </ul>

        <p className="events-subtitle">
          You can edit and resubmit it, or delete it from Your events.
        </p>

        <div className="denial-notice-actions">
          <button type="button" className="event-secondary-btn" onClick={dismiss}>
            Close
          </button>
          <button
            type="button"
            className="event-host-btn"
            onClick={() => {
              dismiss();
              setActivePage("events");
              openHostForm(first.id);
            }}
          >
            <FaEdit aria-hidden="true" /> Edit and resubmit
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
