import { useEffect, useMemo, useRef, useState } from "react";
import { FaChevronDown } from "react-icons/fa";

import EventCard from "./EventCard";
import EventDetail from "./EventDetail";
import DeleteEventModal from "./DeleteEventModal";
import {
  canDelete,
  compareEvents,
  dedupeById,
  hasEnded,
  isLive,
  matchesSearch,
  needsDeleteConfirmation,
} from "./format";
import { useEventsStore } from "../../stores/eventsStore";
import { useUIStateStore } from "../../stores/UIStore";
import type { CommunityEvent } from "./types";

/**
 * Event cards carry far less detail than a clip tile, so past four across they
 * stop being readable. The shared `cols` value still drives the grid; it is
 * only clamped for display here.
 */
export const MAX_EVENT_COLUMNS = 4;

function Section({
  title,
  events,
  onOpen,
  cols,
  deletable,
  onDelete,
  collapsed,
  onToggle,
  highlighted,
  ownId,
}: {
  title: string;
  events: CommunityEvent[];
  onOpen: (id: string) => void;
  cols: number;
  deletable: (event: CommunityEvent) => boolean;
  onDelete: (event: CommunityEvent) => void;
  collapsed: boolean;
  onToggle: (title: string) => void;
  highlighted: Set<string>;
  ownId: string | undefined;
}) {
  if (events.length === 0) return null;

  // Every section uses the same column count so tiles stay one size across the
  // page, exactly like the clip grid. A short section simply leaves its trailing
  // columns empty rather than stretching one card across the row.
  const gridStyle = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  };

  return (
    <section className="events-section">
      <button
        type="button"
        className="events-section-title"
        onClick={() => onToggle(title)}
        aria-expanded={!collapsed}
      >
        <FaChevronDown
          aria-hidden="true"
          className={`events-section-chevron${collapsed ? " is-collapsed" : ""}`}
        />
        {title} <span className="events-section-count">{events.length}</span>
      </button>

      {!collapsed && (
        <div className="events-grid" style={gridStyle}>
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onOpen={onOpen}
              onDelete={deletable(event) ? () => onDelete(event) : undefined}
              isNew={highlighted.has(event.id)}
              isOwn={Boolean(ownId) && event.hostDiscordId === ownId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Fills the left pane on the Events page, where the clip grid sits on the other
 * pages. Shows the grid, or the detail view for whichever event is open.
 */
export default function EventsBrowser() {
  const active = useEventsStore((s) => s.active);
  const past = useEventsStore((s) => s.past);
  const mine = useEventsStore((s) => s.mine);
  const loading = useEventsStore((s) => s.loading);
  const error = useEventsStore((s) => s.error);
  const search = useEventsStore((s) => s.search);
  const filter = useEventsStore((s) => s.filter);
  const sort = useEventsStore((s) => s.sort);
  const detailId = useEventsStore((s) => s.detailId);
  const profile = useEventsStore((s) => s.profile);
  // Sign-in is started from the toolbar, which has nowhere to report a failure,
  // so the error surfaces here. Without this a misconfigured build makes the
  // Login button look like it does nothing at all.
  const loginError = useEventsStore((s) => s.loginError);
  // Same column count the navbar zoom and ctrl+wheel drive for the clip grid,
  // capped for this page's wider cards.
  const cols = useUIStateStore((s) => Math.min(MAX_EVENT_COLUMNS, Math.max(1, s.cols)));

  const openDetail = useEventsStore((s) => s.openDetail);
  const closeDetail = useEventsStore((s) => s.closeDetail);
  const openHostForm = useEventsStore((s) => s.openHostForm);

  // ctrl + wheel to adjust the grid column count, the same gesture and the same
  // 40px accumulator threshold the clip grid uses.
  const setStoreCols = useUIStateStore((s) => s.setCols);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const wheelAccumRef = useRef(0);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      wheelAccumRef.current += e.deltaY;
      if (Math.abs(wheelAccumRef.current) < 40) return;

      const direction = wheelAccumRef.current > 0 ? 1 : -1;
      wheelAccumRef.current = 0;

      setStoreCols((prev) => Math.max(1, Math.min(MAX_EVENT_COLUMNS, prev + direction)));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setStoreCols]);

  const deleteEvent = useEventsStore((s) => s.deleteEvent);

  // Ids to flag NEW! for this visit. Captured once on mount: marking them seen
  // clears the sidebar badge straight away, while the flags stay readable until
  // the user leaves and comes back.
  const markEventsSeen = useEventsStore((s) => s.markEventsSeen);
  const highlightedEventIds = useEventsStore((s) => s.highlightedEventIds);
  const highlighted = useMemo(() => new Set(highlightedEventIds), [highlightedEventIds]);

  useEffect(() => {
    markEventsSeen();
  }, [markEventsSeen, active]);

  // Collapsed sections, by title. Not persisted: a fold is a "get this out of
  // the way for now" gesture, not a setting.
  //
  // "Requested events" starts folded: the page is primarily for browsing what
  // the community is running, and a host's own pending submissions are a small
  // aside they can open when they want it.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["Requested events"]));
  const toggleSection = (title: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  // Deletion is graded by how much is at stake. A live event has people
  // relying on it, so it asks for a typed phrase; an unreviewed one is a quick
  // confirm; a finished one is only clearing history and goes straight away.
  const [pendingDelete, setPendingDelete] = useState<CommunityEvent | null>(null);

  const requestDelete = (event: CommunityEvent) => {
    if (!needsDeleteConfirmation(event)) {
      void deleteEvent(event.id);
      return;
    }

    if (isLive(event)) {
      setPendingDelete(event);
      return;
    }

    if (window.confirm("Are you sure you want to delete this event?")) {
      void deleteEvent(event.id);
    }
  };

  const confirmDelete = (event: CommunityEvent) => {
    setPendingDelete(null);
    void deleteEvent(event.id);
  };

  const sections = useMemo(() => {
    const ownId = profile?.id;

    /** The filter applies to every section, so it lives in one predicate. */
    const passesFilter = (event: CommunityEvent) => {
      if (filter === "mine") return Boolean(ownId) && event.hostDiscordId === ownId;
      if (filter === "hc") return event.eventType === "hour";
      if (filter === "ec") return event.eventType === "contest";
      return true;
    };

    const matching = (list: CommunityEvent[]) =>
      dedupeById(list)
        .filter((event) => matchesSearch(event, search))
        .filter(passesFilter)
        .sort((a, b) => compareEvents(a, b, sort));

    // Submissions still waiting on a moderator, plus any that were denied.
    // Once approved an event graduates to the public sections, so it leaves
    // this one rather than being listed twice.
    const requested = matching(mine).filter((event) => event.status !== "approved");

    // Includes the user's own approved events: this is "what the community is
    // running", and hiding yours leaves the page looking empty when you host
    // most of what is on.
    const activeSection = matching(active).filter((event) => !hasEnded(event));

    return [
      { title: "Requested events", events: requested },
      { title: "Active & Upcoming", events: activeSection },
      { title: "Past", events: matching(past) },
    ];
  }, [active, past, mine, search, filter, sort, profile?.id]);

  const detailEvent = useMemo(() => {
    if (!detailId) return null;
    return [...mine, ...active, ...past].find((event) => event.id === detailId) ?? null;
  }, [detailId, mine, active, past]);

  if (detailEvent) {
    return (
      <div className="events-pane">
        <EventDetail
          event={detailEvent}
          onBack={closeDetail}
          onEdit={
            detailEvent.hostDiscordId === profile?.id ? (id) => openHostForm(id) : undefined
          }
          onDelete={
            canDelete(detailEvent, profile?.id) ? () => requestDelete(detailEvent) : undefined
          }
        />

        <DeleteEventModal
          event={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      </div>
    );
  }

  const total = sections.reduce((sum, section) => sum + section.events.length, 0);

  return (
    <div className="events-pane" ref={paneRef}>
      {error && <p className="events-error">{error}</p>}
      {loginError && <p className="events-error">{loginError}</p>}
      {loading && <p className="events-empty">Loading events...</p>}

      {!loading && total === 0 && (
        <p className="events-empty">
          {search.trim()
            ? `No events match "${search.trim()}".`
            : filter === "mine"
              ? "You are not hosting any events yet."
              : filter === "hc"
                ? "No hour challenges right now."
                : filter === "ec"
                  ? "No long contests right now."
                  : "Nothing running right now. Host the first one."}
        </p>
      )}

      {!loading &&
        sections.map((section) => (
          <Section
            key={section.title}
            title={section.title}
            events={section.events}
            onOpen={openDetail}
            cols={cols}
            deletable={(event) => canDelete(event, profile?.id)}
            onDelete={requestDelete}
            collapsed={collapsed.has(section.title)}
            onToggle={toggleSection}
            highlighted={highlighted}
            ownId={profile?.id}
          />
        ))}

      <DeleteEventModal
        event={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
