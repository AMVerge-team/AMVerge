import type { CommunityEvent } from "./types";

/** the fields of hyetta's public /api/events this app uses */
export type HyettaEvent = {
  id: number;
  title: string;
  url: string;
  cover_url: string | null;
  starts_at: string;
  submission_deadline: string;
  status: string;
  group: { name: string; discord_url: string | null } | null;
  prize: { text: string | null } | null;
};

/** hyetta data opens in the system browser, so only https links get through */
function httpsUrl(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("https://") ? value : null;
}

/** hours from the title ("Sirius 3HC"), never a prize ("$50 hc"); else the window, whose extra minutes are upload time */
function hourCount(title: string, startsMs: number, endsMs: number): number {
  const named = title.match(/(?<![$\d.,])(\d{1,2})\s*hc\b/i);
  const hours = named ? Number(named[1]) : Math.floor((endsMs - startsMs) / 3_600_000);
  return Math.max(1, hours);
}

function prizeLabel(text: string | null | undefined): string | null {
  if (!text) return null;
  return /^\d/.test(text) ? `$${text}` : text;
}

function toCommunityEvent(raw: HyettaEvent): CommunityEvent {
  const startsMs = Date.parse(raw.starts_at);
  const endsMs = Date.parse(raw.submission_deadline);
  const cover = httpsUrl(raw.cover_url);

  return {
    id: `hyetta-${raw.id}`,
    title: raw.title,
    description: "",
    discordInviteUrl: httpsUrl(raw.group?.discord_url) ?? "",
    prizePool: prizeLabel(raw.prize?.text),
    // every hyetta event is an hour contest
    eventType: "hour",
    durationHours: hourCount(raw.title, startsMs, endsMs),
    startsAt: raw.starts_at,
    endsAt: raw.submission_deadline,
    hostDiscordId: null,
    hostName: raw.group?.name ?? null,
    hasThumbnail: Boolean(cover),
    thumbnailUrl: cover,
    createdAt: raw.starts_at,
    updatedAt: raw.starts_at,
    hyettaUrl: httpsUrl(raw.url),
  };
}

/** one calendar month back, clamped like postgres; mirrors the server's PUBLIC_PAST_EVENT_RETENTION */
function pastCutoff(now: number): number {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
  if (cutoff.getUTCDate() !== day) cutoff.setUTCDate(0);
  return cutoff.getTime();
}

/** events still running or upcoming, plus ones ended within the same window as amverge's own */
export function listedHyettaEvents(events: HyettaEvent[], now = Date.now()): CommunityEvent[] {
  const cutoff = pastCutoff(now);

  return events
    .filter((raw) => {
      if (typeof raw.title !== "string") return false;
      const starts = Date.parse(raw.starts_at);
      const ends = Date.parse(raw.submission_deadline);
      if (!Number.isFinite(starts) || !Number.isFinite(ends)) return false;
      // finished early: its deadline would still file it under upcoming
      if (raw.status === "finished" && ends > now) return false;
      return ends >= cutoff;
    })
    .map(toCommunityEvent);
}
