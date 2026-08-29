import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaDiscord,
  FaImage,
  FaMinus,
  FaPaperPlane,
  FaPlus,
  FaSpinner,
} from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import DateTimePicker from "./DateTimePicker";
import DescriptionEditor from "./DescriptionEditor";
import EventDetail from "./EventDetail";
import EventPreviewStage from "./EventPreviewStage";
import { useEventsStore } from "../../stores/eventsStore";
import type { CommunityEvent, EventThumbnail, EventType } from "./types";

// Mirrors the server's limits so the host is told before the round trip.
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 4000;
// Digits only; the leading $ is added on submit and is not editable.
const PRIZE_DIGITS_MAX = 9;
const INVITE_MAX = 200;
// Matches AMVERGE_MAX_EVENT_THUMBNAIL_BYTES on the server. Sized for animated
// GIF covers, which are far heavier than a still image.
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
const MAX_THUMBNAIL_MB = Math.round(MAX_THUMBNAIL_BYTES / (1024 * 1024));
const ALLOWED_THUMBNAIL_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type FormState = {
  title: string;
  description: string;
  discordInviteUrl: string;
  prizePool: string;
  eventType: EventType;
  durationHours: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  discordInviteUrl: "",
  prizePool: "",
  eventType: "contest",
  durationHours: "1",
  startsAt: "",
  endsAt: "",
};

const MIN_HOURS = 1;
const MAX_HOURS = 24;

const EVENT_TYPES: { value: EventType; label: string; hint: string }[] = [
  { value: "contest", label: "Contest", hint: "Runs between a start and end date" },
  { value: "hour", label: "Hour Contest", hint: "A single one-hour slot" },
];

const HOUR_MS = 60 * 60 * 1000;

type PreviewMode = "tile" | "detail";

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInputValue(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";

  const offset = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(localValue: string): string | null {
  if (!localValue) return null;
  const parsed = new Date(localValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Same allowlist the server enforces. Checking here too means a typo is caught
 * before the submission is spent against the rate limit.
 */
function isValidDiscordInvite(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "discord.gg") return url.pathname.length > 1;
    if (url.hostname === "discord.com" || url.hostname === "www.discord.com") {
      return url.pathname.startsWith("/invite/") && url.pathname.length > "/invite/".length;
    }
    return false;
  } catch {
    return false;
  }
}

async function readThumbnail(file: File): Promise<EventThumbnail> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the image."));
    };
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) throw new Error("Could not read the image.");

  return { mimeType: file.type, dataBase64: dataUrl.slice(commaIndex + 1) };
}

export default function HostEventModal() {
  const open = useEventsStore((s) => s.hostFormOpen);
  const editingId = useEventsStore((s) => s.editingId);
  const mine = useEventsStore((s) => s.mine);
  const profile = useEventsStore((s) => s.profile);
  const loginPending = useEventsStore((s) => s.loginPending);
  const loginError = useEventsStore((s) => s.loginError);

  const closeHostForm = useEventsStore((s) => s.closeHostForm);
  const startLogin = useEventsStore((s) => s.startLogin);
  const saveEvent = useEventsStore((s) => s.saveEvent);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [thumbnail, setThumbnail] = useState<EventThumbnail | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("tile");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const editing = useMemo(
    () => (editingId ? mine.find((event) => event.id === editingId) ?? null : null),
    [editingId, mine]
  );

  // Reset on every open so a previous draft never leaks into a new submission,
  // and load the event being edited into the fields.
  useEffect(() => {
    if (!open) return;

    setError("");
    setMessage("");
    setThumbnail(null);
    setPreviewMode("tile");

    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description,
        discordInviteUrl: editing.discordInviteUrl,
        prizePool: (editing.prizePool ?? "").replace(/\D/g, ""),
        eventType: editing.eventType,
        durationHours: String(editing.durationHours || MIN_HOURS),
        startsAt: toLocalInputValue(editing.startsAt),
        endsAt: toLocalInputValue(editing.endsAt),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, editing]);

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  /**
   * Moving the start past the end would leave the form in a state the host has
   * to notice and fix, so the end follows it to a day later instead.
   */
  const setStartsAt = (next: string) => {
    setForm((previous) => {
      if (!next || !previous.endsAt || new Date(previous.endsAt) > new Date(next)) {
        return { ...previous, startsAt: next };
      }

      const bumped = new Date(next);
      bumped.setDate(bumped.getDate() + 1);
      return { ...previous, startsAt: next, endsAt: toLocalInputValue(bumped.toISOString()) };
    });
  };

  const thumbnailDataUrl = thumbnail
    ? `data:${thumbnail.mimeType};base64,${thumbnail.dataBase64}`
    : editing?.thumbnailUrl ?? null;

  // The preview renders through the real EventCard and EventDetail, so what the
  // host sees here cannot drift from what the grid will show.
  const draftHours = Math.min(
    MAX_HOURS,
    Math.max(MIN_HOURS, Number.parseInt(form.durationHours, 10) || MIN_HOURS)
  );

  const draftStartsAt = toIso(form.startsAt) ?? new Date().toISOString();
  // Hour contests derive their end server-side; mirroring it here keeps the
  // preview honest about what will actually be stored.
  const draftEndsAt =
    form.eventType === "hour"
      ? new Date(new Date(draftStartsAt).getTime() + draftHours * HOUR_MS).toISOString()
      : toIso(form.endsAt) ?? new Date(Date.now() + 86400000).toISOString();

  const draft: CommunityEvent = {
    id: editing?.id ?? "preview",
    title: form.title || "Your event title",
    description: form.description || "Your description will appear here.",
    discordInviteUrl: form.discordInviteUrl,
    prizePool: form.prizePool ? `$${form.prizePool}` : null,
    eventType: form.eventType,
    durationHours: draftHours,
    startsAt: draftStartsAt,
    endsAt: draftEndsAt,
    hostDiscordId: profile?.id ?? "",
    hostUsername: profile?.username ?? "You",
    hostAvatarHash: null,
    hostAvatarUrl: profile?.avatarUrl ?? null,
    hasThumbnail: Boolean(thumbnailDataUrl),
    thumbnailUrl: thumbnailDataUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const handlePickThumbnail = async (file: File | undefined) => {
    if (!file) return;

    if (!ALLOWED_THUMBNAIL_TYPES.includes(file.type)) {
      setError("Thumbnail must be a PNG, JPEG, WebP, or GIF image.");
      return;
    }

    if (file.size > MAX_THUMBNAIL_BYTES) {
      setError(`Thumbnail must be ${MAX_THUMBNAIL_MB} MB or smaller.`);
      return;
    }

    try {
      setThumbnail(await readThumbnail(file));
      setError("");
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError));
    }
  };

  const validate = (): string | null => {
    const title = form.title.trim();
    const description = form.description.trim();

    if (!title) return "Title is required.";
    if (title.length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or fewer.`;
    if (!description) return "Description is required.";
    if (description.length > DESCRIPTION_MAX)
      return `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
    if (form.prizePool.length > PRIZE_DIGITS_MAX)
      return `Prize pool must be ${PRIZE_DIGITS_MAX} digits or fewer.`;
    if (form.discordInviteUrl.trim().length > INVITE_MAX)
      return `Discord invite must be ${INVITE_MAX} characters or fewer.`;
    if (!isValidDiscordInvite(form.discordInviteUrl.trim()))
      return "Enter a discord.gg or discord.com/invite link.";

    const startsAt = toIso(form.startsAt);
    if (!startsAt) {
      return form.eventType === "hour"
        ? "Pick the date and time it happens."
        : "Start date is required.";
    }

    if (form.eventType === "contest") {
      const endsAt = toIso(form.endsAt);
      if (!endsAt) return "End date is required.";
      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime())
        return "The end date must be after the start date.";
    } else {
      const hours = Number(form.durationHours);
      if (!Number.isInteger(hours) || hours < MIN_HOURS || hours > MAX_HOURS)
        return `Hours must be a whole number between ${MIN_HOURS} and ${MAX_HOURS}.`;
    }

    if (!editing && !thumbnail) return "A thumbnail is required.";

    return null;
  };

  const handleSubmit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      setMessage("");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    const result = await saveEvent({
      title: form.title.trim(),
      description: form.description.trim(),
      discordInviteUrl: form.discordInviteUrl.trim(),
      prizePool: form.prizePool ? `$${form.prizePool}` : null,
      eventType: form.eventType,
      durationHours: draftHours,
      startsAt: draftStartsAt,
      endsAt: draftEndsAt,
      thumbnail,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.message || "Could not submit the event.");
      return;
    }

    setMessage(
      editing
        ? "Edit submitted. It goes live once a moderator approves it."
        : "Submitted. Your event appears once a moderator approves it."
    );
  };

  return (
    <ModalShell
      open={open}
      onClose={closeHostForm}
      label={editing ? "Edit event" : "Host an event"}
      className="host-event-modal"
    >
      <div className="host-event-panel">
        <header className="host-event-header">
          <h2>{editing ? "Edit your event" : "Host an event"}</h2>
          <p className="events-subtitle">
            Every submission is reviewed by a moderator before it appears in the grid.
          </p>
        </header>

        {!profile ? (
          <div className="host-event-signin">
            <FaDiscord aria-hidden="true" />
            <h3>Sign in with Discord to host</h3>
            <p>
              Browsing is open to everyone. Hosting needs an account so the community knows
              who is running the event.
            </p>
            <button
              type="button"
              className="event-host-btn"
              onClick={() => void startLogin()}
              disabled={loginPending}
            >
              {loginPending ? (
                <>
                  <FaSpinner className="host-event-spinner" aria-hidden="true" /> Waiting for
                  Discord...
                </>
              ) : (
                <>
                  <FaDiscord aria-hidden="true" /> Sign in with Discord
                </>
              )}
            </button>
            {loginPending && (
              <p className="events-subtitle">
                Finish the sign-in in your browser, then come back to this window.
              </p>
            )}
            {loginError && <p className="events-error">{loginError}</p>}
          </div>
        ) : (
          <div className="bugreport-grid host-event-grid">
            <form
              className="about-card bugreport-card-main"
              noValidate
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                void handleSubmit();
              }}
            >
              <div className="bugreport-field">
                <label className="bugreport-label">
                  Event type<span className="required-star">*</span>
                </label>
                <div className="event-type-picker" role="radiogroup" aria-label="Event type">
                  {EVENT_TYPES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={form.eventType === option.value}
                      className={`event-type-option${form.eventType === option.value ? " is-selected" : ""}`}
                      onClick={() => setField("eventType", option.value)}
                    >
                      <span className="event-type-option-label">{option.label}</span>
                      <span className="event-type-option-hint">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bugreport-field">
                <label className="bugreport-label" htmlFor="host-event-title">
                  Title<span className="required-star">*</span>
                </label>
                <input
                  id="host-event-title"
                  type="text"
                  maxLength={TITLE_MAX}
                  value={form.title}
                  onChange={(changeEvent) => setField("title", changeEvent.target.value)}
                  placeholder="Summer AMV Contest"
                />
              </div>

              <div className="bugreport-field">
                <label className="bugreport-label">Thumbnail<span className="required-star">*</span></label>
                <p className="bugreport-help">
                  PNG, JPEG, WebP, or GIF. Up to {MAX_THUMBNAIL_MB} MB.
                </p>
                <input
                  ref={fileInputRef}
                  className="bugreport-file-input"
                  type="file"
                  accept={ALLOWED_THUMBNAIL_TYPES.join(",")}
                  onChange={(changeEvent) => {
                    void handlePickThumbnail(changeEvent.target.files?.[0]);
                    changeEvent.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="event-secondary-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FaImage aria-hidden="true" />
                  {thumbnailDataUrl ? "Replace thumbnail" : "Choose thumbnail"}
                </button>
              </div>

              <div className="bugreport-field">
                <label className="bugreport-label" htmlFor="host-event-description">
                  Description<span className="required-star">*</span>
                </label>
                <DescriptionEditor
                  id="host-event-description"
                  maxLength={DESCRIPTION_MAX}
                  value={form.description}
                  onChange={(next) => setField("description", next)}
                  placeholder="What the event is, how to enter, and how entries are judged."
                />
              </div>

              <div className="bugreport-field">
                <label className="bugreport-label" htmlFor="host-event-invite">
                  Discord invite<span className="required-star">*</span>
                </label>
                <input
                  id="host-event-invite"
                  type="url"
                  maxLength={INVITE_MAX}
                  value={form.discordInviteUrl}
                  onChange={(changeEvent) => setField("discordInviteUrl", changeEvent.target.value)}
                  placeholder="https://discord.gg/..."
                />
              </div>

              <div className="host-event-row">
                <div className="bugreport-field">
                  <label className="bugreport-label" htmlFor="host-event-start">
                    {form.eventType === "hour" ? "Date and time" : "Starts"}
                    <span className="required-star">*</span>
                  </label>
                  <DateTimePicker
                    id="host-event-start"
                    value={form.startsAt}
                    onChange={setStartsAt}
                    placeholder="Pick a date and time"
                  />
                </div>

                {form.eventType === "hour" && (
                  <div className="bugreport-field">
                    <label className="bugreport-label" htmlFor="host-event-hours">
                      Hours<span className="required-star">*</span>
                    </label>
                    <div className="event-hours-stepper">
                      <button
                        type="button"
                        className="event-hours-step"
                        onClick={() => setField("durationHours", String(Math.max(MIN_HOURS, draftHours - 1)))}
                        disabled={draftHours <= MIN_HOURS}
                        aria-label="Fewer hours"
                      >
                        <FaMinus aria-hidden="true" />
                      </button>
                      <input
                        id="host-event-hours"
                        className="event-hours-input"
                        type="number"
                        inputMode="numeric"
                        min={MIN_HOURS}
                        max={MAX_HOURS}
                        step={1}
                        value={form.durationHours}
                        onChange={(changeEvent) => setField("durationHours", changeEvent.target.value)}
                      />
                      <button
                        type="button"
                        className="event-hours-step"
                        onClick={() => setField("durationHours", String(Math.min(MAX_HOURS, draftHours + 1)))}
                        disabled={draftHours >= MAX_HOURS}
                        aria-label="More hours"
                      >
                        <FaPlus aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}

                {form.eventType === "contest" && (
                  <div className="bugreport-field">
                    <label className="bugreport-label" htmlFor="host-event-end">
                      Ends<span className="required-star">*</span>
                    </label>
                    <DateTimePicker
                      id="host-event-end"
                      value={form.endsAt}
                      onChange={(next) => setField("endsAt", next)}
                      placeholder="Pick a date and time"
                      minDate={form.startsAt ? new Date(form.startsAt) : undefined}
                    />
                  </div>
                )}
              </div>

              <div className="bugreport-field">
                <label className="bugreport-label" htmlFor="host-event-prize">
                  Prize pool
                </label>
                <div className="event-prize-field">
                  <span className="event-prize-prefix" aria-hidden="true">$</span>
                  <input
                    id="host-event-prize"
                    type="text"
                    inputMode="numeric"
                    maxLength={PRIZE_DIGITS_MAX}
                    value={form.prizePool}
                    // Digits only. Everything else — currency symbols, words,
                    // and above all links — is stripped as it is typed, which
                    // is what makes this field safe to edit without review.
                    onChange={(changeEvent) =>
                      setField("prizePool", changeEvent.target.value.replace(/\D/g, ""))
                    }
                    placeholder="100, or leave blank"
                  />
                </div>
              </div>

              {error && <p className="events-error">{error}</p>}
              {message && <p className="events-success">{message}</p>}

              <div className="host-event-actions">
                <button type="button" className="event-secondary-btn" onClick={closeHostForm}>
                  Cancel
                </button>
                <button type="submit" className="event-host-btn" disabled={submitting}>
                  {submitting ? (
                    <>
                      <FaSpinner className="host-event-spinner" aria-hidden="true" /> Submitting...
                    </>
                  ) : (
                    <>
                      <FaPaperPlane aria-hidden="true" /> {editing ? "Submit edit" : "Submit for review"}
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="about-card host-event-preview">
              <div className="host-event-preview-head">
                <span className="bugreport-label">Preview</span>
                <div className="host-event-carousel">
                  <button
                    type="button"
                    className="event-icon-btn"
                    onClick={() => setPreviewMode(previewMode === "tile" ? "detail" : "tile")}
                    aria-label="Previous preview"
                  >
                    <FaChevronLeft aria-hidden="true" />
                  </button>
                  <span className="host-event-carousel-label">
                    {previewMode === "tile" ? "Grid tile" : "Detail view"}
                  </span>
                  <button
                    type="button"
                    className="event-icon-btn"
                    onClick={() => setPreviewMode(previewMode === "tile" ? "detail" : "tile")}
                    aria-label="Next preview"
                  >
                    <FaChevronRight aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="host-event-preview-stage">
                {previewMode === "tile" ? (
                  <EventPreviewStage draft={draft} />
                ) : (
                  <EventDetail event={draft} preview />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
