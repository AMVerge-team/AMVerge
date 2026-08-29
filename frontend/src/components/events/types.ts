/**
 * "contest" runs between two dates the host picks. "hour" is a single scheduled
 * slot — the host gives one time and the server derives the one-hour window.
 */
export type EventType = "contest" | "hour";

/** Shape returned by the AMVerge API, passed straight through by Rust. */
export type CommunityEvent = {
  id: string;
  title: string;
  description: string;
  discordInviteUrl: string;
  prizePool: string | null;
  eventType: EventType;
  /** How many hours an hour contest runs. Ignored for a contest. */
  durationHours: number;
  startsAt: string;
  endsAt: string;
  hostDiscordId: string;
  hostUsername: string | null;
  hostAvatarHash: string | null;
  /** Only set on a local draft, where the avatar is known but its hash is not. */
  hostAvatarUrl?: string | null;
  hasThumbnail: boolean;
  /** Absolute by the time it reaches the webview; Rust rewrites it. */
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only present on the host's own events. */
  status?: "pending" | "approved" | "denied";
  denialReason?: string | null;
  /** Whether the host has already been shown this denial. */
  denialSeen?: boolean;
  pendingRevision?: EventSubmission | null;
};

export type EventThumbnail = {
  mimeType: string;
  dataBase64: string;
};

export type EventSubmission = {
  title: string;
  description: string;
  discordInviteUrl: string;
  prizePool: string | null;
  eventType: EventType;
  /** 1-24. Only meaningful for an hour contest. */
  durationHours: number;
  startsAt: string;
  /** Ignored by the server for hour contests, which derive their own end. */
  endsAt: string;
  thumbnail?: EventThumbnail | null;
};

/** What the webview is allowed to know about the signed-in user. */
export type DiscordProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

export type EventsResult = {
  ok: boolean;
  message: string | null;
  events: CommunityEvent[];
};

export type EventMutationResult = {
  ok: boolean;
  message: string | null;
  event: CommunityEvent | null;
};

export type DiscordLoginEvent = {
  ok: boolean;
  message: string | null;
  profile: DiscordProfile | null;
};
