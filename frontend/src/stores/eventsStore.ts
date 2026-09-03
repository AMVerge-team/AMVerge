import { create } from "zustand";
import { persist } from "zustand/middleware";
import { open } from "@tauri-apps/plugin-shell";

import {
  acknowledgeEventApproval,
  acknowledgeEventDenial,
  beginDiscordLogin,
  cancelDiscordLogin,
  deleteEventRequest,
  discordLogout,
  fetchEvents,
  fetchMyEvents,
  readDiscordSession,
  submitEventRequest,
  updateEventRequest,
} from "../utils/eventsApi";
import type {
  CommunityEvent,
  DiscordProfile,
  EventSubmission,
} from "../components/events/types";

/**
 * not persisted: the event list is server state and the Discord session lives in
 * the OS credential store, so there is nothing here worth carrying across a
 * restart.
 */
/** Which slice of the catalogue the grid is showing */
export type EventFilter = "all" | "mine" | "hc" | "ec";

export type EventSort = "date-asc" | "date-desc" | "prize-desc" | "prize-asc";

export type EventsState = {
  active: CommunityEvent[];
  past: CommunityEvent[];
  mine: CommunityEvent[];
  loading: boolean;
  error: string | null;

  search: string;
  filter: EventFilter;
  sort: EventSort;

  /** event shown in the detail view, by id */
  detailId: string | null;
  hostFormOpen: boolean;
  /** Set while the host form is editing one of the user's own events */
  editingId: string | null;

  profile: DiscordProfile | null;
  loginPending: boolean;
  loginError: string | null;

  /**
   * approved events the user has already been shown, so a badge only ever
   * counts genuinely new ones. persisted; everything else here is server state
   * or session state.
   */
  seenEventIds: string[];
  /** false until the first successful load establishes the baseline */
  hasSeededSeenEvents: boolean;
  /**
   * ids to mark NEW! for the current visit. filled when the page opens and
   * deliberately not persisted, so the flags clear on the next visit even
   * though the ids stay in `seenEventIds`.
   */
  highlightedEventIds: string[];
};

export type EventsStore = EventsState & {
  setSearch: (search: string) => void;
  setFilter: (filter: EventFilter) => void;
  setSort: (sort: EventSort) => void;
  loadEvents: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  loadMine: () => Promise<void>;
  refreshSession: () => Promise<void>;
  startLogin: () => Promise<void>;
  finishLogin: (profile: DiscordProfile | null, message: string | null) => void;
  logout: () => Promise<void>;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openHostForm: (editingId?: string | null) => void;
  closeHostForm: () => void;
  saveEvent: (submission: EventSubmission) => Promise<{ ok: boolean; message: string | null }>;
  deleteEvent: (eventId: string) => Promise<{ ok: boolean; message: string | null }>;
  dismissDenialNotice: () => void;
  dismissApprovalNotice: () => void;
  markEventsSeen: () => void;
};

/** plenty for any realistic catalogue, and bounds the persisted payload */
const SEEN_ID_LIMIT = 500;

/**
 * Events a badge could plausibly count: approved and not yet finished. a host's
 * own submissions are excluded: being told your own event is new is noise.
 */
function visibleEventIds(state: Pick<EventsState, "active" | "profile">): string[] {
  return state.active
    .filter((event) => event.hostDiscordId !== state.profile?.id)
    .map((event) => event.id);
}

/** ids that are visible but not yet seen. drives the sidebar badge */
export function selectNewEventIds(state: EventsState): string[] {
  const seen = new Set(state.seenEventIds);
  return visibleEventIds(state).filter((id) => !seen.has(id));
}

const INITIAL_STATE: EventsState = {
  active: [],
  past: [],
  mine: [],
  loading: false,
  error: null,
  search: "",
  filter: "all",
  sort: "date-asc",
  detailId: null,
  hostFormOpen: false,
  editingId: null,
  profile: null,
  loginPending: false,
  loginError: null,
  seenEventIds: [],
  hasSeededSeenEvents: false,
  highlightedEventIds: [],
};

export const useEventsStore = create<EventsStore>()(
  persist(
    (set, get) => ({
  ...INITIAL_STATE,

  setSearch: (search) => set({ search }),
  setFilter: (filter) => set({ filter }),
  setSort: (sort) => set({ sort }),

  /** background refresh: same fetch, but never touches `loading` or `error`,
   *  so a poll cannot flash the grid or surface a transient network blip */
  refreshEvents: async () => {
    try {
      const [active, past] = await Promise.all([fetchEvents("active"), fetchEvents("past")]);
      if (!active.ok || !past.ok) return;

      set({ active: active.events, past: past.events });

      if (!get().hasSeededSeenEvents) {
        set({
          hasSeededSeenEvents: true,
          seenEventIds: visibleEventIds(get()).slice(-SEEN_ID_LIMIT),
        });
      }

      if (get().profile) await get().loadMine();
    } catch {
      // a failed poll just means the next one tries again
    }
  },

  loadEvents: async () => {
    set({ loading: true, error: null });

    try {
      const [active, past] = await Promise.all([
        fetchEvents("active"),
        fetchEvents("past"),
      ]);

      if (!active.ok || !past.ok) {
        set({
          loading: false,
          error: active.message || past.message || "Could not load events.",
        });
        return;
      }

      set({ active: active.events, past: past.events, loading: false, error: null });

      // a fresh install has seen nothing, which would badge the whole existing
      // catalogue as new. treat the first successful load as the baseline
      if (!get().hasSeededSeenEvents) {
        set({
          hasSeededSeenEvents: true,
          seenEventIds: visibleEventIds(get()).slice(-SEEN_ID_LIMIT),
        });
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  loadMine: async () => {
    if (!get().profile) {
      set({ mine: [] });
      return;
    }

    try {
      const result = await fetchMyEvents();
      set({ mine: result.ok ? result.events : [] });
    } catch {
      // the host's own list is supplementary; a failure here must not blank the
      // public grid the user came for
      set({ mine: [] });
    }
  },

  refreshSession: async () => {
    try {
      const profile = await readDiscordSession();
      set({ profile });
      if (profile) await get().loadMine();
    } catch {
      set({ profile: null });
    }
  },

  startLogin: async () => {
    set({ loginPending: true, loginError: null });

    try {
      const url = await beginDiscordLogin();
      await open(url);
    } catch (err) {
      set({
        loginPending: false,
        loginError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  finishLogin: (profile, message) => {
    set({ loginPending: false, profile, loginError: profile ? null : message });
    if (profile) void get().loadMine();
  },

  logout: async () => {
    await discordLogout();
    set({ profile: null, mine: [], editingId: null, hostFormOpen: false });
  },

  openDetail: (detailId) => set({ detailId }),
  closeDetail: () => set({ detailId: null }),

  openHostForm: (editingId = null) => set({ hostFormOpen: true, editingId }),
  closeHostForm: () => {
    if (useEventsStore.getState().loginPending) {
      void cancelDiscordLogin().catch(() => {});
    }
    set({ hostFormOpen: false, editingId: null, loginPending: false });
  },

  saveEvent: async (submission) => {
    const editingId = get().editingId;

    try {
      const result = editingId
        ? await updateEventRequest(editingId, submission)
        : await submitEventRequest(submission);

      if (!result.ok) {
        void get().loadEvents();
        void get().loadMine();
        return { ok: false, message: result.message };
      }

      await get().loadMine();
      return { ok: true, message: null };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  },

  deleteEvent: async (eventId) => {
    try {
      const result = await deleteEventRequest(eventId);

      // refetch either way: on success to drop the row, on failure because the
      // list was probably stale to begin with
      await Promise.all([get().loadEvents(), get().loadMine()]);

      if (!result.ok) return { ok: false, message: result.message };

      // the detail view may be showing the event that just went away
      if (get().detailId === eventId) set({ detailId: null });
      return { ok: true, message: null };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * marks every unseen denial as seen. local state updates immediately so the
   * notice cannot reappear while the server call is in flight.
   */
  dismissDenialNotice: () => {
    const unseen = get().mine.filter(
      (event) => event.status === "denied" && event.denialSeen === false
    );
    if (unseen.length === 0) return;

    set({
      mine: get().mine.map((event) =>
        event.status === "denied" ? { ...event, denialSeen: true } : event
      ),
    });

    for (const event of unseen) {
      void acknowledgeEventDenial(event.id).catch(() => {});
    }
  },

  /** the approval counterpart, same one-shot behaviour as the denial notice */
  dismissApprovalNotice: () => {
    const unseen = get().mine.filter(
      (event) => event.status === "approved" && event.approvalSeen === false
    );
    if (unseen.length === 0) return;

    set({
      mine: get().mine.map((event) =>
        event.status === "approved" ? { ...event, approvalSeen: true } : event
      ),
    });

    for (const event of unseen) {
      void acknowledgeEventApproval(event.id).catch(() => {});
    }
  },

  /**
   * called when the events page opens. everything currently new is highlighted
   * for this visit and simultaneously recorded as seen, so the sidebar badge
   * clears immediately while the NEW! flags stay readable until the user
   * leaves and comes back.
   */
  markEventsSeen: () => {
    const visible = visibleEventIds(get());
    const seen = new Set(get().seenEventIds);
    const fresh = visible.filter((id) => !seen.has(id));

    if (fresh.length === 0 && get().highlightedEventIds.length === 0) return;

    for (const id of visible) seen.add(id);

    set({
      highlightedEventIds: fresh,
      // bounded so a long-lived install cannot grow this without limit; ids
      // that fall off are old events no longer in any list
      seenEventIds: Array.from(seen).slice(-SEEN_ID_LIMIT),
    });
  },
    }),
    {
      name: "amverge.events.v1",
      // only the seen set is worth carrying across a restart. event lists are
      // server state, and highlights are meant to last one visit
      partialize: (state) => ({
        seenEventIds: state.seenEventIds,
        hasSeededSeenEvents: state.hasSeededSeenEvents,
      }),
    }
  )
);
