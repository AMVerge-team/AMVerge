import { useEffect, useMemo, useRef, useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { FaChevronLeft, FaChevronRight, FaDiscord, FaExternalLinkAlt, FaImage, FaMinus, FaPaperPlane, FaPlus, FaSpinner } from '../icons/animated';

import ModalShell from "../common/ModalShell";
import DateTimePicker from "./DateTimePicker";
import DescriptionEditor from "./DescriptionEditor";
import EventDetail from "./EventDetail";
import EventPreviewStage from "./EventPreviewStage";
import { useEventsStore } from "../../stores/eventsStore";
import type { CommunityEvent, EventThumbnail, EventType } from "./types";

// mirrors the server's limits so the host is told before the round trip
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 4000;
// digits only; the leading $ is added on submit and is not editable
const PRIZE_DIGITS_MAX = 9;
const INVITE_MAX = 200;
const HOST_NAME_MAX = 40;
const HYETTA_EVENTS_URL = "https://hyetta.net/events";
// matches the server's AMVERGE_MAX_EVENT_THUMBNAIL_BYTES, sized for animated GIF covers
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
const MAX_THUMBNAIL_MB = Math.round(MAX_THUMBNAIL_BYTES / (1024 * 1024));
const ALLOWED_THUMBNAIL_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type FormState = {
  title: string;
  description: string;
  discordInviteUrl: string;
  hyettaUrl: string;
  prizePool: string;
  eventType: EventType;
  hostName: string;
  durationHours: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  discordInviteUrl: "",
  hyettaUrl: "",
  prizePool: "",
  eventType: "contest",
  hostName: "",
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

// in page order, so the first problem is the one scrolled to
const FIELD_ORDER = [
  "title",
  "thumbnail",
  "description",
  "discordInviteUrl",
  "hyettaUrl",
  "startsAt",
  "durationHours",
  "endsAt",
  "prizePool",
] as const;
type FieldKey = (typeof FIELD_ORDER)[number];
type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_LABELS: Record<FieldKey, string> = {
  title: "Title",
  thumbnail: "Thumbnail",
  description: "Description",
  discordInviteUrl: "Discord invite",
  hyettaUrl: "Hyetta link",
  startsAt: "Start",
  durationHours: "Hours",
  endsAt: "End",
  prizePool: "Prize pool",
};

type PreviewMode = "tile" | "detail";

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string */
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

/** the server's invite allowlist, checked here so a typo doesn't spend a rate-limited submission */
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

/** mirrors the server: an event page on hyetta, e.g. https://hyetta.net/event/67 */
function isValidHyettaLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "hyetta.net" &&
      /^\/event\/\d+(\/.*)?$/.test(url.pathname)
    );
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // cleared on unmount and reopen so a pending auto-close never hits a returned-to form
  const closeTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const editing = useMemo(
    () => (editingId ? mine.find((event) => event.id === editingId) ?? null : null),
    [editingId, mine]
  );

  // the target the form holds (event id or "new"), keyed by id so a background refetch can't reset it
  const populatedFor = useRef<string | null>(null);

  // transient UI reset on open or target change, not on `editing`, so a refetch can't wipe a shown error
  useEffect(() => {
    if (!open) {
      populatedFor.current = null;
      return;
    }

    setError("");
    setFieldErrors({});
    setMessage("");
    setSubmitting(false);
    setThumbnail(null);
    setPreviewMode("tile");

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [open, editingId]);

  // fill the fields once per target, waiting for the event if the list is still loading
  useEffect(() => {
    if (!open) return;

    const target = editingId ?? "__new__";
    if (populatedFor.current === target) return;
    // editing something not in `mine` yet: wait rather than blanking the form
    if (editingId && !editing) return;

    populatedFor.current = target;

    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description,
        discordInviteUrl: editing.discordInviteUrl,
        hyettaUrl: editing.hyettaUrl ?? "",
        prizePool: (editing.prizePool ?? "").replace(/\D/g, ""),
        eventType: editing.eventType,
        hostName: editing.hostName ?? "",
        durationHours: String(editing.durationHours || MIN_HOURS),
        startsAt: toLocalInputValue(editing.startsAt),
        endsAt: toLocalInputValue(editing.endsAt),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, editingId, editing]);

  // a close scheduled after a submit must not fire once unmounted
  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  // editing a field clears its own error, and the banner's list with it
  const clearFieldError = (...keys: FieldKey[]) => {
    setFieldErrors((previous) => {
      if (!keys.some((key) => previous[key])) return previous;
      const next = { ...previous };
      for (const key of keys) delete next[key];
      return next;
    });
  };

  const invalidKeys = FIELD_ORDER.filter((key) => fieldErrors[key]);
  const banner =
    invalidKeys.length > 0
      ? `Fix ${invalidKeys.length === 1 ? "this field" : "these fields"}: ${invalidKeys.map((key) => FIELD_LABELS[key]).join(", ")}.`
      : error;

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (field === "eventType") clearFieldError("startsAt", "endsAt", "durationHours", "hyettaUrl");
    else if ((FIELD_ORDER as readonly string[]).includes(field)) clearFieldError(field as FieldKey);
  };

  const fieldClass = (key: FieldKey) => `bugreport-field${fieldErrors[key] ? " is-invalid" : ""}`;
  const fieldError = (key: FieldKey) =>
    fieldErrors[key] ? <p className="bugreport-field-error">{fieldErrors[key]}</p> : null;

  /** moving the start past the end pushes the end to a day later */
  const setStartsAt = (next: string) => {
    clearFieldError("startsAt", "endsAt");
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
    // an event in review has no public thumbnail url, so its cover comes inline
    : editing?.thumbnailDataUrl ?? editing?.thumbnailUrl ?? null;

  // the preview uses the real EventCard and EventDetail, so it can't drift from the grid
  const draftHours = Math.min(
    MAX_HOURS,
    Math.max(MIN_HOURS, Number.parseInt(form.durationHours, 10) || MIN_HOURS)
  );

  const draftStartsAt = toIso(form.startsAt) ?? new Date().toISOString();
  // hour contests derive their end server-side; mirrored here for the preview
  const draftEndsAt =
    form.eventType === "hour"
      ? new Date(new Date(draftStartsAt).getTime() + draftHours * HOUR_MS).toISOString()
      : toIso(form.endsAt) ?? new Date(Date.now() + 86400000).toISOString();

  // the field only exists for hour contests, so a link typed before switching type is dropped
  const hyettaUrl = form.eventType === "hour" ? form.hyettaUrl.trim() || null : null;

  const draft: CommunityEvent = {
    id: editing?.id ?? "preview",
    title: form.title || "Your event title",
    description: form.description || "Your description will appear here.",
    discordInviteUrl: form.discordInviteUrl,
    hyettaUrl,
    prizePool: form.prizePool ? `$${form.prizePool}` : null,
    eventType: form.eventType,
    durationHours: draftHours,
    startsAt: draftStartsAt,
    endsAt: draftEndsAt,
    hostDiscordId: profile?.id ?? "",
    hostName: form.hostName.trim() || null,
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
      clearFieldError("thumbnail");
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError));
    }
  };

  /** every problem at once, keyed by field, so the host fixes them in one go */
  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const title = form.title.trim();
    const description = form.description.trim();
    const invite = form.discordInviteUrl.trim();

    if (!title) errors.title = "Add a title.";
    else if (title.length > TITLE_MAX) errors.title = `Keep it to ${TITLE_MAX} characters or fewer.`;

    if (!editing && !thumbnail) errors.thumbnail = "Choose a thumbnail.";

    if (!description) errors.description = "Write a description.";
    else if (description.length > DESCRIPTION_MAX)
      errors.description = `Keep it to ${DESCRIPTION_MAX} characters or fewer.`;

    if (!invite) errors.discordInviteUrl = "Add your server's invite link.";
    else if (invite.length > INVITE_MAX)
      errors.discordInviteUrl = `Keep it to ${INVITE_MAX} characters or fewer.`;
    else if (!isValidDiscordInvite(invite))
      errors.discordInviteUrl = "Use a discord.gg or discord.com/invite link.";

    if (hyettaUrl && !isValidHyettaLink(hyettaUrl))
      errors.hyettaUrl = "Use a hyetta.net/event link, or leave it blank.";

    const startsAt = toIso(form.startsAt);
    if (!startsAt) {
      errors.startsAt = form.eventType === "hour" ? "Pick the date and time." : "Pick when it starts.";
    }

    if (form.eventType === "contest") {
      const endsAt = toIso(form.endsAt);
      if (!endsAt) errors.endsAt = "Pick when it ends.";
      else if (startsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime())
        errors.endsAt = "It has to end after it starts.";
    } else {
      const hours = Number(form.durationHours);
      if (!Number.isInteger(hours) || hours < MIN_HOURS || hours > MAX_HOURS)
        errors.durationHours = `A whole number from ${MIN_HOURS} to ${MAX_HOURS}.`;
    }

    if (form.prizePool.length > PRIZE_DIGITS_MAX)
      errors.prizePool = `${PRIZE_DIGITS_MAX} digits or fewer.`;

    return errors;
  };

  const showProblems = (errors: FieldErrors) => {
    const keys = FIELD_ORDER.filter((key) => errors[key]);
    setFieldErrors(errors);
    setMessage("");
    setError("");

    // bring the first one into view and put the cursor in it
    requestAnimationFrame(() => {
      const field = formRef.current?.querySelector<HTMLElement>(`[data-field="${keys[0]}"]`);
      field?.scrollIntoView({ block: "center", behavior: "smooth" });
      field?.querySelector<HTMLElement>("input:not([type=file]), [contenteditable], button")?.focus({ preventScroll: true });
    });
  };

  const handleSubmit = async () => {
    // the disabled button doesn't cover Enter in a field, so guard double submits here
    if (submitting) return;

    const problems = validate();
    if (Object.keys(problems).length > 0) {
      showProblems(problems);
      return;
    }

    setSubmitting(true);
    setError("");
    setFieldErrors({});
    setMessage("");

    const result = await saveEvent({
      title: form.title.trim(),
      description: form.description.trim(),
      discordInviteUrl: form.discordInviteUrl.trim(),
      hyettaUrl,
      prizePool: form.prizePool ? `$${form.prizePool}` : null,
      eventType: form.eventType,
      hostName: form.hostName.trim() || null,
      durationHours: draftHours,
      startsAt: draftStartsAt,
      endsAt: draftEndsAt,
      thumbnail,
    });

    if (!result.ok) {
      const reason = result.message || "Could not submit the event.";
      console.warn("[events] submission refused:", reason);
      setSubmitting(false);
      setError(reason);
      requestAnimationFrame(() =>
        formRef.current?.querySelector(".host-event-alert")?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      );
      return;
    }

    // stays disabled after success; the confirmation shows briefly, then the modal closes itself
    setMessage(
      editing
        ? "Edit submitted. It goes live once a moderator approves it."
        : "Submitted. Your event appears once a moderator approves it."
    );

    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      closeHostForm();
    }, 1600);
  };

  return (
    <ModalShell
      open={open}
      onClose={closeHostForm}
      label={editing ? "Edit event" : "Host an event"}
      className={`host-event-modal${profile ? "" : " host-event-modal-signin"}`}
    >
      <div className="host-event-panel">
        <header className="host-event-header">
          <h2>{editing ? "Edit your event" : "Host an event"}</h2>
          <p className="events-subtitle">
            Submissions are reviewed by a moderator before it appears.
          </p>
        </header>

        {!profile ? (
          <div className="host-event-signin">
            <FaDiscord aria-hidden="true" />
            <h3>Sign in with Discord to host</h3>
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
              ref={formRef}
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

              <div className={fieldClass("title")} data-field="title">
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
                  aria-invalid={fieldErrors.title ? true : undefined}
                />
                {fieldError("title")}
              </div>

              <div className={fieldClass("thumbnail")} data-field="thumbnail">
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
                {fieldError("thumbnail")}
              </div>

              <div className={fieldClass("description")} data-field="description">
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
                {fieldError("description")}
              </div>

              <div className={`host-event-row${form.eventType === "hour" ? "" : " is-single"}`}>
                <div className={fieldClass("discordInviteUrl")} data-field="discordInviteUrl">
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
                    aria-invalid={fieldErrors.discordInviteUrl ? true : undefined}
                  />
                  {fieldError("discordInviteUrl")}
                </div>

                {form.eventType === "hour" && (
                  <div className={fieldClass("hyettaUrl")} data-field="hyettaUrl">
                    <label className="bugreport-label" htmlFor="host-event-hyetta">
                      <a
                        className="host-event-hyetta-site"
                        href={HYETTA_EVENTS_URL}
                        onClick={(clickEvent) => {
                          clickEvent.preventDefault();
                          void openExternal(HYETTA_EVENTS_URL);
                        }}
                      >
                        Hyetta
                        <FaExternalLinkAlt aria-hidden="true" />
                      </a>{" "}
                      link
                    </label>
                    <input
                      id="host-event-hyetta"
                      type="url"
                      maxLength={INVITE_MAX}
                      value={form.hyettaUrl}
                      onChange={(changeEvent) => setField("hyettaUrl", changeEvent.target.value)}
                      placeholder="If it's already on Hyetta"
                      aria-invalid={fieldErrors.hyettaUrl ? true : undefined}
                    />
                    {fieldError("hyettaUrl")}
                  </div>
                )}
              </div>

              <div className="host-event-row">
                <div className={fieldClass("startsAt")} data-field="startsAt">
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
                  {fieldError("startsAt")}
                </div>

                {form.eventType === "hour" && (
                  <div className={fieldClass("durationHours")} data-field="durationHours">
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
                    {fieldError("durationHours")}
                  </div>
                )}

                {form.eventType === "contest" && (
                  <div className={fieldClass("endsAt")} data-field="endsAt">
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
                    {fieldError("endsAt")}
                  </div>
                )}
              </div>

              <div className={fieldClass("prizePool")} data-field="prizePool">
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
                    // digits only, stripped as typed, which keeps this field safe without review
                    onChange={(changeEvent) =>
                      setField("prizePool", changeEvent.target.value.replace(/\D/g, ""))
                    }
                    placeholder="100, or leave blank"
                  />
                </div>
                {fieldError("prizePool")}
              </div>

              {banner && (
                <div className="bugreport-alert error host-event-alert" role="alert">
                  {banner}
                </div>
              )}
              {message && (
                <div className="bugreport-alert success host-event-alert" role="status">
                  {message}
                </div>
              )}

              <div className="host-event-actions">
                <div className="bugreport-field host-event-name">
                  <input
                    type="text"
                    aria-label="Host name"
                    maxLength={HOST_NAME_MAX}
                    value={form.hostName}
                    onChange={(changeEvent) => setField("hostName", changeEvent.target.value)}
                    placeholder="Host name (blank = anonymous)"
                  />
                </div>

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
