import { open } from "@tauri-apps/plugin-shell";
import { FaArrowLeft, FaCalendarAlt, FaCheckCircle, FaDiscord, FaEdit, FaTrash, FaTrophy } from "react-icons/fa";

import RichText from "./RichText";
import {
  countdownLabel,
  eventTypeLabel,
  formatDateTimeShort,
  formatDuration,
  hasEnded,
  isLive,
  hostAvatarUrl,
  statusLabel,
} from "./format";
import type { CommunityEvent } from "./types";

type EventDetailProps = {
  event: CommunityEvent;
  onBack?: () => void;
  onEdit?: (id: string) => void;
  /** only passed when the signed-in host is allowed to remove this event */
  onDelete?: (id: string) => void;
  /** rendered inside the host form's preview: no navigation, no outbound link */
  preview?: boolean;
};

export default function EventDetail({ event, onBack, onEdit, onDelete, preview = false }: EventDetailProps) {
  const ended = hasEnded(event);
  const avatar = hostAvatarUrl(event);
  const status = statusLabel(event);

  const handleJoin = () => {
    if (preview) return;
    void open(event.discordInviteUrl);
  };

  return (
    <div className={`event-detail${preview ? " is-preview" : ""}`}>
      {!preview && onBack && (
        <button type="button" className="event-detail-back" onClick={onBack}>
          <FaArrowLeft aria-hidden="true" /> All events
        </button>
      )}

      <div className="event-detail-banner">
        {event.thumbnailUrl ? (
          <img src={event.thumbnailUrl} alt="" draggable={false} />
        ) : (
          <div className="event-card-thumb-empty" aria-hidden="true">
            <FaCalendarAlt />
          </div>
        )}
      </div>

      <div className="event-detail-head">
        <h2>{event.title || "Untitled event"}</h2>
        {status && <span className={`event-card-status is-${status.tone}`}>{status.text}</span>}
      </div>

      {event.status === "denied" && (
        <div className="event-detail-denied">
          <strong>This event was not approved.</strong>
          <span>{event.denialReason || "No reason was given."}</span>
          {onEdit && (
            <span className="event-detail-denied-hint">
              Edit it to address the note above and send it back for review.
            </span>
          )}
        </div>
      )}

      {/* `onEdit` is only passed for an event the signed-in user hosts, so it
          doubles as the ownership test without threading the profile down. */}
      {onEdit && isLive(event) && !event.pendingRevision && (
        <p className="event-detail-approved">
          <FaCheckCircle aria-hidden="true" /> Your event was approved and is live.
        </p>
      )}

      {event.pendingRevision && (
        <p className="event-detail-revision">
          Your edit is waiting for review. The version below stays public until it is approved.
        </p>
      )}

      <div className="event-detail-facts">
        <div>
          <span className="event-detail-fact-label">
            {event.eventType === "hour" ? "Happening" : "Runs"}
          </span>
          <span className="event-detail-fact-value">
            {event.eventType === "hour"
              ? `${formatDateTimeShort(event.startsAt)} · ${formatDuration(event)}`
              : `${formatDateTimeShort(event.startsAt)} - ${formatDateTimeShort(event.endsAt)}`}
          </span>
        </div>
        <div>
          <span className="event-detail-fact-label">Format</span>
          <span className="event-detail-fact-value">{eventTypeLabel(event)}</span>
        </div>
        <div>
          <span className="event-detail-fact-label">Status</span>
          <span className="event-detail-fact-value">
            {ended ? "Ended" : countdownLabel(event) ?? "Running"}
          </span>
        </div>
        {event.prizePool && (
          <div>
            <span className="event-detail-fact-label">Prize pool</span>
            <span className="event-detail-prize">
              <FaTrophy aria-hidden="true" /> {event.prizePool}
            </span>
          </div>
        )}
      </div>

      {/* Capped height with its own scroll: the actions sit directly under a
          short description, and a long one scrolls rather than pushing them
          off the bottom of the pane. */}
      <RichText value={event.description} className="event-detail-description" />

      <div className="event-detail-actions">
        <span className="event-detail-host">
          {avatar ? (
            <img src={avatar} alt="" className="event-card-avatar" draggable={false} />
          ) : (
            <span className="event-card-avatar event-card-avatar-empty" aria-hidden="true" />
          )}
          Hosted by {event.hostUsername || "Unknown host"}
        </span>

        <div className="event-detail-buttons">
          {!preview && onDelete && (
            <button type="button" className="event-danger-btn" onClick={() => onDelete(event.id)}>
              <FaTrash aria-hidden="true" /> Delete
            </button>
          )}
          {!preview && onEdit && (
            <button type="button" className="event-secondary-btn" onClick={() => onEdit(event.id)}>
              <FaEdit aria-hidden="true" />{" "}
              {event.status === "denied" ? "Edit and resubmit" : "Edit"}
            </button>
          )}
          <button
            type="button"
            className="event-join-btn"
            onClick={handleJoin}
            disabled={preview}
          >
            <FaDiscord aria-hidden="true" /> Join on Discord
          </button>
        </div>
      </div>
    </div>
  );
}
