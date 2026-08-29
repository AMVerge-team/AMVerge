import { create } from "zustand";
import { open } from "@tauri-apps/plugin-shell";

import {
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
 * Not persisted: the event list is server state and the Discord session lives in
 * the OS credential store, so there is nothing here worth carrying across a
 * restart.
 */
/** Which slice of the catalogue the grid is showing. */
export type EventFilter = "all" | "active" | "past" | "mine";

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

  /** Event shown in the detail view, by id. */
  detailId: string | null;
  hostFormOpen: boolean;
  /** Set while the host form is editing one of the user's own events. */
  editingId: string | null;

  profile: DiscordProfile | null;
  loginPending: boolean;
  loginError: string | null;
};

export type EventsStore = EventsState & {
  setSearch: (search: string) => void;
  setFilter: (filter: EventFilter) => void;
  setSort: (sort: EventSort) => void;
  loadEvents: () => Promise<void>;
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
};

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
};

export const useEventsStore = create<EventsStore>()((set, get) => ({
  ...INITIAL_STATE,

  setSearch: (search) => set({ search }),
  setFilter: (filter) => set({ filter }),
  setSort: (sort) => set({ sort }),

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
      // The host's own list is supplementary; a failure here must not blank the
      // public grid the user came for.
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

      // Refetch either way: on success to drop the row, on failure because the
      // list was probably stale to begin with.
      await Promise.all([get().loadEvents(), get().loadMine()]);

      if (!result.ok) return { ok: false, message: result.message };

      // The detail view may be showing the event that just went away.
      if (get().detailId === eventId) set({ detailId: null });
      return { ok: true, message: null };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Marks every unseen denial as seen. Local state updates immediately so the
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
}));
