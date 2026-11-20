import { useEffect, useMemo, useRef, useState } from "react";
import { FaPlay } from "react-icons/fa";
import { FaCalendarAlt, FaTrash, FaTrophy } from '../icons/animated';

import Tooltip from "../common/Tooltip";

import { countdownLabel, eventTypeBadge, eventTypeLabel, formatSchedule, hasEnded, isLive, statusLabel } from "./format";
import type { CommunityEvent } from "./types";
import { parseAnnouncementVideo } from "./videoUrl";

const HOVER_PREVIEW_DELAY_MS = 250;

type EventCardProps = {
  event: CommunityEvent;
  onOpen?: (id: string) => void;
  /** rendered inside the host form's preview, where it must not be clickable */
  preview?: boolean;
  /** shows a delete control. only passed for events the signed-in host may remove */
  onDelete?: (id: string) => void;
  /** flags an event the user has not seen before, for this visit only */
  isNew?: boolean;
  /** true when the signed-in user hosts this event */
  isOwn?: boolean;
};

/** grid tile, kept presentational so the host form previews a draft with the same component */
export default function EventCard({ event, onOpen, preview = false, onDelete, isNew = false, isOwn = false }: EventCardProps) {
  const ended = hasEnded(event);
  const countdown = countdownLabel(event);
  const status = statusLabel(event);
  // pending/denied events cannot be served from the public thumbnail route, so use the host's inline data URL first
  const coverSrc = event.thumbnailDataUrl || event.thumbnailUrl;
  const video = useMemo(() => parseAnnouncementVideo(event.announcementVideoUrl), [event.announcementVideoUrl]);
  const [hoverPlaying, setHoverPlaying] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
  }, []);

  const handlePointerEnter = () => {
    if (preview || !video) return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      setHoverPlaying(true);
    }, HOVER_PREVIEW_DELAY_MS);
  };

  const handlePointerLeave = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (hoverPlaying) setHoverPlaying(false);
  };

  const body = (
    <>
      <div className="event-card-thumb">
        {coverSrc ? (
          <img src={coverSrc} alt="" loading="lazy" draggable={false} />
        ) : (
          <div className="event-card-thumb-empty" aria-hidden="true">
            <FaCalendarAlt />
          </div>
        )}
        {hoverPlaying && video && (
          video.kind === "direct" ? (
            <video
              className="event-card-hover-video"
              src={video.src}
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <iframe
              className="event-card-hover-video"
              src={video.hoverEmbedUrl}
              title=""
              allow="autoplay; encrypted-media"
              tabIndex={-1}
            />
          )
        )}
        <span className="event-card-type" title={eventTypeLabel(event)}>
          {eventTypeBadge(event)}
        </span>
        {video && (
          <span className="event-card-video-badge" title="Includes announcement video">
            <FaPlay aria-hidden="true" /> Video
          </span>
        )}
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
          {event.hostName && <span className="event-card-host">{event.hostName}</span>}

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

  // the delete control sits outside the card button, since nested buttons swallow the click
  return (
    <div className="event-card-slot">
      <button
        type="button"
        className={className}
        onClick={() => onOpen?.(event.id)}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
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
