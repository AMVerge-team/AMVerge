import type { CommunityEvent } from "./types";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

function parse(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string): string {
  const parsed = parse(value);
  if (!parsed) return value;

  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return parsed.toLocaleDateString(undefined, {
    ...DATE_FORMAT,
    year: sameYear ? undefined : "numeric",
  });
}

export function formatDateRange(startsAt: string, endsAt: string): string {
  return `${formatDate(startsAt)} - ${formatDate(endsAt)}`;
}

/**
 * Date and time with the year dropped when it is the current one, which is the
 * common case. Keeps a range readable in the narrow detail pane, where the full
 * form ran to two lines.
 */
export function formatDateTimeShort(value: string): string {
  const parsed = parse(value);
  if (!parsed) return value;

  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value: string): string {
  const parsed = parse(value);
  if (!parsed) return value;
  return parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * An hour contest happens at a time, not across a range, so it reads as one
 * date and start time rather than two dates that would both say the same day.
 */
export function formatSchedule(event: CommunityEvent): string {
  if (event.eventType === "hour") {
    return `${formatDate(event.startsAt)} · ${formatTime(event.startsAt)}`;
  }
  return formatDateRange(event.startsAt, event.endsAt);
}

/** Human duration for an hour contest, e.g. "4 hours". */
export function formatDuration(event: CommunityEvent): string {
  const hours = event.durationHours || 1;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function eventTypeLabel(event: CommunityEvent): string {
  if (event.eventType !== "hour") return "Contest";
  const hours = event.durationHours || 1;
  return `${hours} Hour Contest`;
}

/**
 * Short form for the tile badge. An hour contest carries its length, so a
 * four-hour one reads "4HC" and a full-day one "24HC".
 */
export function eventTypeBadge(event: CommunityEvent): string {
  if (event.eventType !== "hour") return "EC";
  return `${event.durationHours || 1}HC`;
}

export function formatDateTime(value: string): string {
  const parsed = parse(value);
  if (!parsed) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Days until an event starts or ends, whichever it is waiting on. Returns null
 * once the event is over.
 */
export function countdownLabel(event: CommunityEvent): string | null {
  const now = Date.now();
  const starts = parse(event.startsAt)?.getTime();
  const ends = parse(event.endsAt)?.getTime();

  if (ends !== undefined && ends < now) return null;

  const target = starts !== undefined && starts > now ? starts : ends;
  if (target === undefined) return null;

  const days = Math.ceil((target - now) / 86_400_000);
  const prefix = starts !== undefined && starts > now ? "Starts" : "Ends";

  if (days <= 0) return `${prefix} today`;
  if (days === 1) return `${prefix} tomorrow`;
  return `${prefix} in ${days} days`;
}

/**
 * Review status, shown only on a host's own events — public listings are
 * approved by definition, so they carry no badge.
 */
export function statusLabel(
  event: CommunityEvent
): { text: string; tone: "pending" | "denied" | "revision" } | null {
  if (event.pendingRevision) return { text: "Edit in review", tone: "revision" };
  if (event.status === "pending") return { text: "In review", tone: "pending" };
  if (event.status === "denied") return { text: "Denied", tone: "denied" };
  return null;
}

/**
 * Whether the signed-in host may remove this event. A live approved event is
 * off limits — people are relying on it — so only one awaiting review, denied,
 * or already finished can go. Mirrors the server's rule.
 */
export function canDelete(event: CommunityEvent, hostDiscordId: string | undefined): boolean {
  return Boolean(hostDiscordId) && event.hostDiscordId === hostDiscordId;
}

/**
 * Whether removing this event should be confirmed first. A finished event is
 * just clearing history, so it goes straight away; anything still to come or
 * still running is a decision worth pausing on.
 */
export function needsDeleteConfirmation(event: CommunityEvent): boolean {
  return !hasEnded(event);
}

/**
 * Whether an event is publicly live. The public list omits `status` altogether
 * and only ever contains approved events, so an absent status means approved —
 * checking `status === "approved"` misses every card in the public sections.
 */
export function isLive(event: CommunityEvent): boolean {
  return event.status !== "pending" && event.status !== "denied";
}

export function hasEnded(event: CommunityEvent, now = Date.now()): boolean {
  const end = parse(event.endsAt)?.getTime();
  return end !== undefined && end < now;
}

/**
 * Free-text match over the fields a person would search by. Host name is
 * included so "who is running anything right now" is answerable.
 */
export function matchesSearch(event: CommunityEvent, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [event.title, event.description, event.prizePool, event.hostUsername]
    .filter((field): field is string => typeof field === "string")
    .some((field) => field.toLowerCase().includes(needle));
}

/**
 * Prize pool is free text ("$100", "1,000 USD + Nitro"), so sorting reads the
 * first number out of it. Anything with no number sorts as no prize rather than
 * as zero, which keeps unprized events out of the middle of the order.
 */
export function prizeAmount(event: CommunityEvent): number | null {
  if (!event.prizePool) return null;

  const match = event.prizePool.replace(/,/g, "").match(/\d+(\.\d+)?/);
  if (!match) return null;

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Comparator for the grid's sort control. */
export function compareEvents(
  a: CommunityEvent,
  b: CommunityEvent,
  sort: "date-asc" | "date-desc" | "prize-desc" | "prize-asc"
): number {
  if (sort === "date-asc" || sort === "date-desc") {
    const left = parse(a.startsAt)?.getTime() ?? 0;
    const right = parse(b.startsAt)?.getTime() ?? 0;
    return sort === "date-asc" ? left - right : right - left;
  }

  const left = prizeAmount(a);
  const right = prizeAmount(b);

  // Events without a prize always sit at the end, whichever direction is asked
  // for — they are not "cheapest", they are absent.
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  return sort === "prize-desc" ? right - left : left - right;
}

/** De-duplicates by id, since a host's own event also appears in the public lists. */
export function dedupeById(events: CommunityEvent[]): CommunityEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

export function hostAvatarUrl(event: CommunityEvent): string | null {
  if (event.hostAvatarUrl) return event.hostAvatarUrl;
  if (!event.hostAvatarHash) return null;
  return `https://cdn.discordapp.com/avatars/${event.hostDiscordId}/${event.hostAvatarHash}.png?size=64`;
}
