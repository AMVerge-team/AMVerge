import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  scoutAddVideo,
  scoutCreateDatabase,
  scoutDatabaseInfo,
  scoutDeleteDatabase,
  scoutListDatabases,
  scoutListVideos,
  scoutSearch,
  scoutStatus,
} from "../features/sceneScout/api";
import {
  DEFAULT_SEARCH_SETTINGS,
  type ScoutDatabase,
  type ScoutHit,
  type ScoutSearchSettings,
  type ScoutStatus,
  type ScoutVideo,
} from "../features/sceneScout/types";
import { useAiDepsStore } from "./aiDepsStore";
import { useGeneralSettingsStore } from "./settingsStore";

/** The storage root every call has to be told about, read fresh each time. */
function customPath(): string | null {
  return useGeneralSettingsStore.getState().episodesPath;
}

type SceneScoutState = {
  status: ScoutStatus | null;
  databases: ScoutDatabase[];
  /** which database the panel has open; null before anything is selected */
  openedDatabase: string | null;
  videos: ScoutVideo[];

  query: string;
  results: ScoutHit[];
  /** the query the current results came from, so the grid can caption itself */
  lastQuery: string;

  loading: boolean;
  searching: boolean;
  indexing: { video: string; stage: string; done: number; total: number } | null;
  error: string | null;

  settings: ScoutSearchSettings;

  /** absolute paths of databases the user saved outside the managed folder.
   *  they never show up in the root listing, so the app has to remember them */
  externalPaths: string[];
  /** display name per database, keyed by path. defaults to the file name */
  displayNames: Record<string, string>;
};

type SceneScoutActions = {
  refreshStatus: () => Promise<void>;
  loadDatabases: () => Promise<void>;
  createDatabase: (pathOrName: string) => Promise<{ ok: boolean; message: string | null }>;
  renameDatabase: (path: string, displayName: string) => void;
  deleteDatabase: (name: string) => Promise<void>;
  openDatabase: (name: string | null) => Promise<void>;
  loadVideos: (name: string) => Promise<void>;
  addVideo: (videoPath: string) => Promise<{ ok: boolean; message: string | null }>;
  setQuery: (query: string) => void;
  runSearch: () => Promise<void>;
  clearResults: () => void;
  updateSettings: (changes: Partial<ScoutSearchSettings>) => void;
  setIndexing: (progress: SceneScoutState["indexing"]) => void;
  refresh: () => Promise<void>;
};

const INITIAL: SceneScoutState = {
  status: null,
  databases: [],
  openedDatabase: null,
  videos: [],
  query: "",
  results: [],
  lastQuery: "",
  loading: false,
  searching: false,
  indexing: null,
  error: null,
  settings: DEFAULT_SEARCH_SETTINGS,
  externalPaths: [],
  displayNames: {},
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useSceneScoutStore = create<SceneScoutState & SceneScoutActions>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      refreshStatus: async () => {
        try {
          set({ status: await scoutStatus(customPath()) });
        } catch (err) {
          // a failing status is not fatal: databases still list, and the page
          // explains a missing model rather than blocking on it
          set({ status: null, error: message(err) });
        }
      },

      loadDatabases: async () => {
        // only show a spinner when there is genuinely nothing to display. with a
        // cached list the panel renders instantly, like the episode and
        // Scenepacks panels do, and this refresh happens silently behind it
        set({ loading: get().databases.length === 0, error: null });
        try {
          const inRoot = await scoutListDatabases(customPath());

          // databases the user saved elsewhere are asked about one by one, and
          // a missing one is dropped rather than left as a dead row
          const external = await Promise.all(
            get().externalPaths.map((path) =>
              scoutDatabaseInfo(path, customPath()).catch(() => null)
            )
          );
          const alive = external.filter((d): d is NonNullable<typeof d> => d !== null);

          const databases = [...inRoot, ...alive];
          set({
            databases,
            externalPaths: alive.map((d) => d.path),
            loading: false,
          });

          // the opened database can vanish (deleted here or elsewhere), and a
          // panel pointing at nothing would keep showing its stale video list
          const opened = get().openedDatabase;
          if (opened && !databases.some((d) => d.name === opened)) {
            set({ openedDatabase: null, videos: [] });
          }
        } catch (err) {
          set({ loading: false, error: message(err) });
        }
      },

      /** `pathOrName` is a full path when the user picked a location themselves */
      createDatabase: async (pathOrName) => {
        try {
          const created = await scoutCreateDatabase(pathOrName, customPath());

          // remember it only when it landed outside the managed folder, which is
          // the case the root listing cannot find on its own
          const root = get().status?.root;
          const isExternal = !root || !created.path.startsWith(root);
          if (isExternal && !get().externalPaths.includes(created.path)) {
            set({ externalPaths: [...get().externalPaths, created.path] });
          }

          await get().loadDatabases();
          return { ok: true, message: null };
        } catch (err) {
          return { ok: false, message: message(err) };
        }
      },

      /** the label shown in the panel, which is separate from the file name */
      renameDatabase: (path, displayName) =>
        set((state) => ({
          displayNames: { ...state.displayNames, [path]: displayName },
        })),

      deleteDatabase: async (name) => {
        try {
          await scoutDeleteDatabase(name, customPath());
          if (get().openedDatabase === name) set({ openedDatabase: null, videos: [] });
          await get().loadDatabases();
        } catch (err) {
          set({ error: message(err) });
        }
      },

      openDatabase: async (name) => {
        set({ openedDatabase: name, videos: [] });
        if (name) await get().loadVideos(name);
      },

      loadVideos: async (name) => {
        try {
          set({ videos: await scoutListVideos(name, customPath()) });
        } catch (err) {
          set({ videos: [], error: message(err) });
        }
      },

      addVideo: async (videoPath) => {
        const database = get().openedDatabase;
        if (!database) return { ok: false, message: "Open a database first." };

        // indexing needs the model, so offer the install here rather than
        // letting the CLI fail several seconds in. mirrors how the ml pack
        // gates AI scene detection in useImportPipeline
        if (!(await useAiDepsStore.getState().ensurePack("scout"))) {
          return { ok: false, message: "Scene Scout needs its AI pack installed." };
        }

        set({ indexing: { video: videoPath, stage: "starting", done: 0, total: 1 } });
        try {
          // Scene Scout indexes with whichever detector the user picked in
          // Settings, so its scenes match what importing the episode would give
          const detector = useGeneralSettingsStore.getState().sceneDetectionMethod;
          await scoutAddVideo(database, videoPath, detector, customPath());
          await Promise.all([get().loadVideos(database), get().loadDatabases()]);
          return { ok: true, message: null };
        } catch (err) {
          return { ok: false, message: message(err) };
        } finally {
          set({ indexing: null });
        }
      },

      setQuery: (query) => set({ query }),

      runSearch: async () => {
        const query = get().query.trim();
        if (!query) return;

        if (!(await useAiDepsStore.getState().ensurePack("scout"))) {
          set({ error: "Scene Scout needs its AI pack installed." });
          return;
        }

        set({ searching: true, error: null });
        try {
          const results = await scoutSearch(query, get().settings, customPath());
          set({ results, lastQuery: query, searching: false });
        } catch (err) {
          set({ searching: false, results: [], error: message(err) });
        }
      },

      clearResults: () => set({ results: [], lastQuery: "", query: "" }),

      updateSettings: (changes) =>
        set((state) => ({ settings: { ...state.settings, ...changes } })),

      setIndexing: (indexing) => set({ indexing }),

      /** re-reads everything from disk, for the toolbar's refresh button */
      refresh: async () => {
        await Promise.all([get().loadDatabases(), get().refreshStatus()]);
        const opened = get().openedDatabase;
        if (opened) await get().loadVideos(opened);
      },
    }),
    {
      name: "amverge.scenescout.v1",
      // only the user's own tuning persists. databases, results and status are
      // all re-read from disk on open, and a stale copy would be worse than none
      partialize: (state) => ({
        settings: state.settings,
        openedDatabase: state.openedDatabase,
        // cached so the panel has something to draw on mount rather than
        // waiting on a CLI spawn. re-read from disk immediately afterwards, so
        // a stale entry corrects itself within a second
        databases: state.databases,
        // the only record that a database outside the managed folder exists
        externalPaths: state.externalPaths,
        displayNames: state.displayNames,
      }),
    }
  )
);
