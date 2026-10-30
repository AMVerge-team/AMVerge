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

/** date and time without the year when it's the current one, so ranges fit the detail pane */
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

/** an hour contest reads as one date and start time, not a range */
export function formatSchedule(event: CommunityEvent): string {
  if (event.eventType === "hour") {
    return `${formatDate(event.startsAt)} · ${formatTime(event.startsAt)}`;
  }
  return formatDateRange(event.startsAt, event.endsAt);
}

/** human duration for an hour contest, e.g. "4 hours" */
export function formatDuration(event: CommunityEvent): string {
  const hours = event.durationHours || 1;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function eventTypeLabel(event: CommunityEvent): string {
  if (event.eventType !== "hour") return "Contest";
  const hours = event.durationHours || 1;
  return `${hours} Hour Contest`;
}

/** short tile badge; hour contests carry their length, e.g. "4HC" */
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

/** days until an event starts or ends; null once over */
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

/** review status for a host's own events; public ones are approved by definition */
export function statusLabel(
  event: CommunityEvent
): { text: string; tone: "pending" | "denied" | "revision" } | null {
  if (event.pendingRevision) return { text: "Edit in review", tone: "revision" };
  if (event.status === "pending") return { text: "In review", tone: "pending" };
  if (event.status === "denied") return { text: "Denied", tone: "denied" };
  return null;
}

/** whether the host may remove this event (not while live and approved); mirrors the server */
export function canDelete(event: CommunityEvent, hostDiscordId: string | undefined): boolean {
  return Boolean(hostDiscordId) && event.hostDiscordId === hostDiscordId;
}

/** finished events delete at once; anything upcoming or running asks first */
export function needsDeleteConfirmation(event: CommunityEvent): boolean {
  return !hasEnded(event);
}

/** whether an event is publicly live; public listings omit `status`, so absent means approved */
export function isLive(event: CommunityEvent): boolean {
  return event.status !== "pending" && event.status !== "denied";
}

export function hasEnded(event: CommunityEvent, now = Date.now()): boolean {
  const end = parse(event.endsAt)?.getTime();
  return end !== undefined && end < now;
}

/** free-text match over title, host name and the other searchable fields */
export function matchesSearch(event: CommunityEvent, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [event.title, event.description, event.prizePool, event.isAnonymous ? null : event.hostUsername]
    .filter((field): field is string => typeof field === "string")
    .some((field) => field.toLowerCase().includes(needle));
}

/** the first number in the free-text prize; none sorts as no prize, not zero */
export function prizeAmount(event: CommunityEvent): number | null {
  if (!event.prizePool) return null;

  const match = event.prizePool.replace(/,/g, "").match(/\d+(\.\d+)?/);
  if (!match) return null;

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** comparator for the grid's sort control */
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

  // events without a prize always sort last, whichever direction
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  return sort === "prize-desc" ? right - left : left - right;
}

/** de-duplicates by id, since a host's own event also appears in the public lists */
export function dedupeById(events: CommunityEvent[]): CommunityEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

export function hostAvatarUrl(event: CommunityEvent): string | null {
  // checks the flag, since the host's own copy of an anonymous event still has their identity
  if (event.isAnonymous) return null;
  if (event.hostAvatarUrl) return event.hostAvatarUrl;
  if (!event.hostAvatarHash || !event.hostDiscordId) return null;
  return `https://cdn.discordapp.com/avatars/${event.hostDiscordId}/${event.hostAvatarHash}.png?size=64`;
}
