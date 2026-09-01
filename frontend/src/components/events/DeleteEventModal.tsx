import { useEffect, useState } from "react";
import { FaExclamationTriangle, FaTrash } from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import type { CommunityEvent } from "./types";

/** Typed exactly, case included. A near miss is treated as a miss. */
const CONFIRM_PHRASE = "I'm sure";

/**
 * Guards deletion of an event that is already live. People are relying on it,
 * and a stray click on a grid tile is far too cheap a way to take it down — so
 * this one asks for the phrase to be typed rather than for a button press.
 */
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

  // Clear between events, so a phrase typed for one deletion can never carry
  // over and pre-arm the next.
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
          // Autocorrect would happily "fix" the apostrophe and leave the phrase
          // looking right while never matching.
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
