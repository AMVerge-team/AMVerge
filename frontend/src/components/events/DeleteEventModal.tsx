import { useEffect, useState } from "react";
import { FaExclamationTriangle, FaTrash } from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import type { CommunityEvent } from "./types";

/** typed exactly, case included. a near miss is treated as a miss */
const CONFIRM_PHRASE = "I'm sure";

/** deleting a live event needs the phrase typed, since a stray click is too cheap a way to take it down */
export default function DeleteEventModal({
  event,
  onCancel,
  onConfirm,
}: {
  event: CommunityEvent | null;
  onCancel: () => void;
  onConfirm: (event: CommunityEvent) => void;
}) {
  const [typed, setTyped] = useState("");

  // cleared between events so a typed phrase never pre-arms the next deletion
  useEffect(() => {
    setTyped("");
  }, [event?.id]);

  if (!event) return null;

  const confirmed = typed === CONFIRM_PHRASE;

  return (
    <ModalShell open onClose={onCancel} label="Delete event" className="denial-notice-modal">
      <div className="denial-notice delete-event-notice">
        <FaExclamationTriangle aria-hidden="true" className="denial-notice-icon" />

        <h2>Are you sure you want to delete your event?</h2>

        <p className="events-subtitle">
          This will delete <strong>{event.title}</strong> for you and all its users. If
          you're sure, type <code>{CONFIRM_PHRASE}</code> in the textbox below.
        </p>

        <input
          className="delete-event-input"
          value={typed}
          onChange={(changeEvent) => setTyped(changeEvent.target.value)}
          placeholder={CONFIRM_PHRASE}
          aria-label={`Type ${CONFIRM_PHRASE} to confirm`}
          autoFocus
          // autocorrect could "fix" the apostrophe so the phrase never matches
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />

        <div className="denial-notice-actions">
          <button type="button" className="event-secondary-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="event-danger-btn"
            disabled={!confirmed}
            onClick={() => onConfirm(event)}
          >
            <FaTrash aria-hidden="true" /> Delete event
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
