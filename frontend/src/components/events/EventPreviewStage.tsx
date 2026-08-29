import { useMemo } from "react";

import EventCard from "./EventCard";
import type { CommunityEvent } from "./types";

const PLACEHOLDER_TITLES = [
  "Winter Collab",
  "48h Jam",
  "Opening Remake",
  "Sakuga Showdown",
  "Beginner Contest",
  "Transition Battle",
  "AMV Royale",
  "Coloring Challenge",
];

const DAY_MS = 86_400_000;

function placeholder(title: string, index: number): CommunityEvent {
  const start = new Date(Date.now() + (index + 1) * DAY_MS).toISOString();
  return {
    id: `placeholder-${index}`,
    title,
    description: "",
    discordInviteUrl: "",
    prizePool: index % 3 === 0 ? "$50" : null,
    eventType: index % 4 === 0 ? "hour" : "contest",
    durationHours: index % 4 === 0 ? 2 + (index % 5) : 1,
    startsAt: start,
    endsAt: new Date(Date.now() + (index + 4) * DAY_MS).toISOString(),
    hostDiscordId: "",
    hostUsername: "Someone",
    hostAvatarHash: null,
    hasThumbnail: false,
    thumbnailUrl: null,
    createdAt: start,
    updatedAt: start,
  };
}

/**
 * Shows the draft tile as it will actually sit in the grid: real neighbours
 * around it, clipped and faded at the edges so the frame reads as a window onto
 * the page rather than a card floating on its own.
 */
export default function EventPreviewStage({ draft }: { draft: CommunityEvent }) {
  const placeholders = useMemo(
    () => PLACEHOLDER_TITLES.map((title, index) => placeholder(title, index)),
    []
  );

  // Four before and four after puts the draft in the middle cell of a 3-wide
  // grid, so it is surrounded on every side.
  const before = placeholders.slice(0, 4);
  const after = placeholders.slice(4);

  return (
    <div className="event-preview-stage">
      <div className="event-preview-grid" aria-hidden="true">
        {before.map((event) => (
          <div key={event.id} className="event-preview-ghost">
            <EventCard event={event} preview />
          </div>
        ))}

        <div className="event-preview-focus">
          <EventCard event={draft} preview />
        </div>

        {after.map((event) => (
          <div key={event.id} className="event-preview-ghost">
            <EventCard event={event} preview />
          </div>
        ))}
      </div>
    </div>
  );
}
