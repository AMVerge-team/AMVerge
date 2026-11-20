import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { FaChevronLeft, FaChevronRight, FaImage, FaPlay } from "react-icons/fa";
import { FaArrowLeft, FaCalendarAlt, FaCheckCircle, FaDiscord, FaEdit, FaExternalLinkAlt, FaTrash, FaTrophy } from '../icons/animated';

import RichText from "./RichText";
import { formatCooldown, useCooldown } from "./useCooldown";
import {
  countdownLabel,
  eventTypeLabel,
  formatDateTimeShort,
  formatDuration,
  hasEnded,
  isLive,
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
  // the edit cooldown is per event, anchored to this machine's clock when the seconds arrived
  const editCooldownUntil = useMemo(
    () => (event.editCooldownSeconds ? Date.now() + event.editCooldownSeconds * 1000 : null),
    [event.id, event.editCooldownSeconds]
  );
  const editCooldown = useCooldown(editCooldownUntil);
  const ended = hasEnded(event);
  const status = statusLabel(event);
  const coverSrc = event.thumbnailDataUrl || event.thumbnailUrl;
  const videoSrc = event.announcementVideoUrl?.trim() || null;
  const hasBothMedia = Boolean(videoSrc && coverSrc);
  const [activeSlide, setActiveSlide] = useState<"video" | "image">(videoSrc ? "video" : "image");

  useEffect(() => {
    setActiveSlide(videoSrc ? "video" : "image");
  }, [event.id, videoSrc]);

  const toggleSlide = () => setActiveSlide((s) => (s === "video" ? "image" : "video"));

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

      <div className={`event-detail-banner${videoSrc ? " has-video" : ""}`}>
        {activeSlide === "video" && videoSrc ? (
          <video
            className="event-detail-video"
            src={videoSrc}
            poster={coverSrc || undefined}
            controls={!preview}
            muted={preview}
            playsInline
          />
        ) : coverSrc ? (
          <img src={coverSrc} alt="" draggable={false} />
        ) : (
          <div className="event-card-thumb-empty" aria-hidden="true">
            <FaCalendarAlt />
          </div>
        )}

        {hasBothMedia && (
          <>
            <button
              type="button"
              className="event-media-nav is-prev"
              onClick={toggleSlide}
              aria-label="Previous media"
            >
              <FaChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="event-media-nav is-next"
              onClick={toggleSlide}
              aria-label="Next media"
            >
              <FaChevronRight aria-hidden="true" />
            </button>
            <div className="event-media-switcher" role="tablist" aria-label="Event media">
              <button
                type="button"
                role="tab"
                aria-selected={activeSlide === "video"}
                className={`event-media-tab${activeSlide === "video" ? " is-active" : ""}`}
                onClick={() => setActiveSlide("video")}
              >
                <FaPlay aria-hidden="true" /> Video
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSlide === "image"}
                className={`event-media-tab${activeSlide === "image" ? " is-active" : ""}`}
                onClick={() => setActiveSlide("image")}
              >
                <FaImage aria-hidden="true" /> Cover
              </button>
            </div>
          </>
        )}
      </div>

      <div className="event-detail-head">
        <h2>{event.title || "Untitled event"}</h2>
        {status && <span className={`event-card-status is-${status.tone}`}>{status.text}</span>}
      </div>

      {event.status === "denied" && (
        <div className="event-detail-denied">
          <strong>This event was not approved.</strong>
          <span className="event-detail-denied-reason">
            <span className="event-detail-denied-label">Reason:</span>{" "}
            {event.denialReason || "No reason was given."}
          </span>
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
      {/* hyetta's feed has no description */}
      {event.description && (
        <RichText value={event.description} className="event-detail-description" />
      )}

      <div className="event-detail-actions">
        {event.hostName && <span className="event-detail-host">Hosted by {event.hostName}</span>}

        <div className="event-detail-buttons">
          {!preview && onDelete && (
            <button type="button" className="event-danger-btn" onClick={() => onDelete(event.id)}>
              <FaTrash aria-hidden="true" /> Delete
            </button>
          )}
          {!preview && onEdit && (
            <button
              type="button"
              className="event-secondary-btn"
              onClick={() => onEdit(event.id)}
              disabled={editCooldown > 0}
              title={
                editCooldown > 0
                  ? `You can edit this event again in ${formatCooldown(editCooldown)}`
                  : undefined
              }
            >
              <FaEdit aria-hidden="true" />{" "}
              {editCooldown > 0
                ? formatCooldown(editCooldown)
                : event.status === "denied"
                  ? "Edit and resubmit"
                  : "Edit"}
            </button>
          )}
          {event.hyettaUrl && (
            <button
              type="button"
              className="event-secondary-btn"
              onClick={() => void open(event.hyettaUrl as string)}
              disabled={preview}
            >
              <FaExternalLinkAlt aria-hidden="true" /> View on Hyetta
            </button>
          )}
          {/* a hyetta group may have no discord */}
          {(preview || event.discordInviteUrl) && (
            <button
              type="button"
              className="event-join-btn"
              onClick={handleJoin}
              disabled={preview}
            >
              <FaDiscord aria-hidden="true" /> Join on Discord
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
