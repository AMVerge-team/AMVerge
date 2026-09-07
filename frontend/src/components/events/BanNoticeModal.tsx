import { FaBan } from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import { formatDateTimeShort } from "./format";
import { useEventsStore } from "../../stores/eventsStore";

/**
 * shown once when a moderator bans the signed-in user from hosting, and again
 * whenever they click the disabled Host button to ask why. dismissing marks it
 * seen server-side, so it does not reappear on the next launch or on another
 * machine.
 */
export default function BanNoticeModal() {
  const ban = useEventsStore((s) => s.ban);
  const noticeOpen = useEventsStore((s) => s.banNoticeOpen);
  const dismiss = useEventsStore((s) => s.dismissBanNotice);

  if (!ban?.banned) return null;
  // unseen bans announce themselves; after that it opens only on request
  if (ban.noticeSeen && !noticeOpen) return null;

  return (
    <ModalShell open onClose={dismiss} label="Hosting suspended" className="denial-notice-modal">
      <div className="denial-notice">
        <FaBan aria-hidden="true" className="denial-notice-icon ban-notice-icon" />

        <h2>You are banned from hosting events</h2>

        <ul className="denial-notice-list">
          <li>
            <span className="denial-notice-title">
              {ban.banIsPermanent
                ? "Permanent"
                : ban.bannedUntil
                  ? `Until ${formatDateTimeShort(ban.bannedUntil)}`
                  : "Temporary"}
            </span>
            <span className="denial-notice-reason">
              <span className="denial-notice-reason-label">Reason:</span>{" "}
              {ban.banReason || "No reason was given."}
            </span>
          </li>
        </ul>

        <p className="events-subtitle ban-notice-note">
          You can still browse events and join them.
        </p>
        <p className="events-subtitle ban-notice-note">
          Your existing events are unaffected.
        </p>

        <div className="denial-notice-actions">
          <button type="button" className="event-secondary-btn" onClick={dismiss}>
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
