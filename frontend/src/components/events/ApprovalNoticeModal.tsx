import { useMemo } from "react";
import { FaCheckCircle } from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import { useEventsStore } from "../../stores/eventsStore";
import { useUIStateStore } from "../../stores/UIStore";

/** announces an approval once, like a denial, and marks it seen server-side so it never reappears */
export default function ApprovalNoticeModal() {
  const mine = useEventsStore((s) => s.mine);
  const dismiss = useEventsStore((s) => s.dismissApprovalNotice);
  const openDetail = useEventsStore((s) => s.openDetail);
  const setActivePage = useUIStateStore((s) => s.setActivePage);

  const approved = useMemo(
    () => mine.filter((event) => event.status === "approved" && event.approvalSeen === false),
    [mine]
  );

  if (approved.length === 0) return null;

  const first = approved[0];

  return (
    <ModalShell open onClose={dismiss} label="Event approved" className="denial-notice-modal">
      <div className="denial-notice">
        <FaCheckCircle aria-hidden="true" className="approval-notice-icon" />

        <h2>
          {approved.length === 1
            ? "Your event is live"
            : `${approved.length} of your events are live`}
        </h2>

        <ul className="denial-notice-list approval-notice-list">
          {approved.map((event) => (
            <li key={event.id}>
              <span className="denial-notice-title">{event.title}</span>
              <span className="approval-notice-detail">
                Approved and visible to everyone on the Events page.
              </span>
            </li>
          ))}
        </ul>

        <div className="denial-notice-actions">
          <button type="button" className="event-secondary-btn" onClick={dismiss}>
            Close
          </button>
          <button
            type="button"
            className="event-host-btn"
            onClick={() => {
              dismiss();
              // shown from any page, so navigate to Events as well as selecting it
              setActivePage("events");
              openDetail(first.id);
            }}
          >
            View event
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
