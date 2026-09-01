import { FaCalendarAlt, FaTrash, FaTrophy } from "react-icons/fa";

import Tooltip from "../common/Tooltip";

import { countdownLabel, eventTypeBadge, eventTypeLabel, formatSchedule, hasEnded, isLive, hostAvatarUrl, statusLabel } from "./format";
import type { CommunityEvent } from "./types";

type EventCardProps = {
  event: CommunityEvent;
  onOpen?: (id: string) => void;
  /** Rendered inside the host form's preview, where it must not be clickable. */
  preview?: boolean;
  /** Shows a delete control. Only passed for events the signed-in host may remove. */
  onDelete?: (id: string) => void;
  /** Flags an event the user has not seen before, for this visit only. */
  isNew?: boolean;
  /** True when the signed-in user hosts this event. */
  isOwn?: boolean;
};

/**
 * Grid tile. Kept presentational so the host form can preview a draft through
 * the same component the grid uses — a mockup would drift.
 */
export default function EventCard({ event, onOpen, preview = false, onDelete, isNew = false, isOwn = false }: EventCardProps) {
  const ended = hasEnded(event);
  const avatar = hostAvatarUrl(event);
  const countdown = countdownLabel(event);
  const status = statusLabel(event);

  const body = (
    <>
      <div className="event-card-thumb">
        {event.thumbnailUrl ? (
          <img src={event.thumbnailUrl} alt="" loading="lazy" draggable={false} />
        ) : (
          <div className="event-card-thumb-empty" aria-hidden="true">
            <FaCalendarAlt />
          </div>
        )}
        <span className="event-card-type" title={eventTypeLabel(event)}>
          {eventTypeBadge(event)}
        </span>
        {isNew && <span className="event-card-new">NEW!</span>}
        {/* Marks the viewer's own live events apart from everyone else's in a
            list that mixes both. */}
        {isOwn && isLive(event) && <span className="event-card-approved">APPROVED</span>}
        {status && <span className={`event-card-status is-${status.tone}`}>{status.text}</span>}
      </div>

      <div className="event-card-body">
        <h3 className="event-card-title">{event.title || "Untitled event"}</h3>

        <div className="event-card-meta">
          <span className="event-card-dates">{formatSchedule(event)}</span>
          {countdown && <span className="event-card-countdown">{countdown}</span>}
        </div>

        <div className="event-card-footer">
          <span className="event-card-host">
            {avatar ? (
              <img src={avatar} alt="" className="event-card-avatar" draggable={false} />
            ) : (
              <span className="event-card-avatar event-card-avatar-empty" aria-hidden="true" />
            )}
            {event.hostUsername || "Unknown host"}
          </span>

          {event.prizePool && (
            <span className="event-card-prize">
              <FaTrophy aria-hidden="true" />
              {event.prizePool}
            </span>
          )}
        </div>
      </div>
    </>
  );

  const className = `event-card${ended ? " is-ended" : ""}${preview ? " is-preview" : ""}`;

  if (preview) {
    return <div className={className}>{body}</div>;
  }

  // The delete control sits outside the card button rather than inside it —
  // a button inside a button is invalid and swallows the click.
  return (
    <div className="event-card-slot">
      <button type="button" className={className} onClick={() => onOpen?.(event.id)}>
        {body}
      </button>

      {onDelete && (
        <Tooltip content="Delete event">
          <button
            type="button"
            className="event-card-delete"
            onClick={() => onDelete(event.id)}
            aria-label={`Delete ${event.title || "event"}`}
          >
            <FaTrash aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
