import { create } from "zustand";
import { persist } from "zustand/middleware";
import { listen } from "@tauri-apps/api/event";

import {
  scoutAddVideo,
  scoutCreateDatabase,
  scoutDatabaseInfo,
  scoutDeleteDatabase,
  scoutDeleteVideo,
  scoutListDatabases,
  scoutListVideos,
  scoutOpenDatabase,
  scoutSearch,
  scoutStatus,
  scoutUnloadModel,
  scoutGenerateThumbnails,
  isScoutCanceled,
} from "../features/sceneScout/api";
import {
  DEFAULT_SEARCH_SETTINGS,
  type FlowSource,
  type ScoutDatabase,
  type ScoutHit,
  type ScoutIndexProgress,
  type ScoutSearchSettings,
  type ScoutStatus,
  type ScoutVideo,
} from "../features/sceneScout/types";
import { claimProcess } from "../features/processes/singleProcess";
import type { SceneRange } from "../features/sceneScout/precutEpisodes";
import { cutIntoLibrary, prioritizeHits } from "../features/sceneScout/library";
import {
  TUTORIAL_DB_NAME,
  TUTORIAL_DB_PATH,
  makeTutorialDatabase,
  makeTutorialVideos,
  searchTutorialHits,
} from "../features/sceneScout/tutorialDemo";
import { DETECT_CANCELED, importAbortRef } from "../features/import/importPipeline";
import { useAiDepsStore } from "./aiDepsStore";
import { useAppStateStore } from "./appStore";
import { useGeneralSettingsStore } from "./settingsStore";
import { useUIStateStore } from "./UIStore";

// the cli's PROGRESS percent when ai detection has read the whole video
const AI_DETECTION_DONE_PERCENT = 50;
// how much of an episode's bar ai detection fills: it is most of the wait
const AI_DETECTION_SHARE = 80;

/** The storage root every call has to be told about, read fresh each time. */
function customPath(): string | null {
  return useGeneralSettingsStore.getState().episodesPath;
}

/** removes episodes a stopped add left half-indexed (the cli marks them `indexing` until the last write) */
async function discardUnfinishedVideos(database: string): Promise<void> {
  try {
    const videos = await scoutListVideos(database, customPath());
    for (const video of videos.filter((v) => v.status === "indexing")) {
      console.log(`SCOUT|queue removing unfinished ${video.name}`);
      await scoutDeleteVideo(database, video.id, customPath());
    }
  } catch (err) {
    console.error("SCOUT|queue could not remove the unfinished episode", err);
  }
}

/** runs a search, showing the model loading card only when rust announces a `loading_model` stage */
async function withModelLoadingCard<T>(search: () => Promise<T>): Promise<T> {
  const appState = useAppStateStore.getState();
  let cardOpened = false;
  const stopListening = await listen<ScoutIndexProgress>("scout_progress", (e) => {
    if (e.payload.stage !== "loading_model") return;
    // this card shares the job window's state, so closing it would close a running export's window
    if (!cardOpened && useAppStateStore.getState().activeOperation) return;
    const { done, total } = e.payload;
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
    cardOpened = true;
    appState.setActiveOperation("scout_search");
    appState.setLoading(true);
    appState.setProgress(pct);
    appState.setProgressMsg("Loading AI model…");
  });

  try {
    return await search();
  } finally {
    stopListening();
    if (cardOpened) {
      appState.setActiveOperation(null);
      appState.setLoading(false);
      appState.setProgressMsg("");
    }
  }
}

type SceneScoutState = {
  status: ScoutStatus | null;
  databases: ScoutDatabase[];
  /** which database the panel has open; null before anything is selected */
  openedDatabase: string | null;
  videos: ScoutVideo[];
  videosByDatabase: Record<string, ScoutVideo[]>;
  expandedDatabases: Record<string, boolean>;
  selectedDatabases: string[];
  /** episodes (video paths) left out of searches, toggled with the eye on a searched database */
  hiddenVideos: string[];

  query: string;
  results: ScoutHit[];
  /** the query the current results came from, so the grid can caption itself */
  lastQuery: string;

  loading: boolean;
  searching: boolean;
  indexing: { video: string; stage: string; done: number; total: number } | null;
  error: string | null;

  settings: ScoutSearchSettings;

  /** databases saved outside the managed folder, which the root listing never shows */
  externalPaths: string[];
  unloadedPaths: string[];
  displayNames: Record<string, string>;
  /** height of the panel's searching box, as a percent of the two boxes together */
  panelSplitPct: number;
  /** runtime only: the first search or flow swaps the centered first-visit layout for the top one */
  heroDismissed: boolean;
  /** runtime only: which Scene Scout tab is showing; search and flow keep separate results */
  mode: ScoutMode;
  /** runtime only: the clip the Flow tab finds scenes to follow */
  flowFrom: FlowSource | null;
  flowResults: ScoutHit[];
  flowSearching: boolean;
  flowError: string | null;
  /** runtime only: a flow or search waiting here while the user picks which databases to search */
  dbPrompt: DbPrompt | null;
  /** runtime only: active step of the in-UI interactive walkthrough (null when inactive) */
  tutorialStep: number | null;
};

export type DbPrompt = { kind: "flow"; source: FlowSource } | { kind: "search" };

export type ScoutMode = "search" | "flow";

type SceneScoutActions = {
  refreshStatus: () => Promise<void>;
  loadDatabases: () => Promise<void>;
  createDatabase: (pathOrName: string) => Promise<{ ok: boolean; message: string | null; path: string | null }>;
  openExistingDatabase: (filePath: string) => Promise<{ ok: boolean; message: string | null; database?: ScoutDatabase }>;
  renameDatabase: (path: string, displayName: string) => void;
  unloadDatabase: (path: string) => void;
  deleteDatabase: (name: string) => Promise<void>;
  openDatabase: (name: string | null) => Promise<void>;
  toggleDatabaseExpanded: (path: string) => Promise<void>;
  selectDatabase: (path: string, mode?: SelectMode, allPaths?: string[]) => void;
  setVideosHidden: (videoPaths: string[], hidden: boolean) => void;
  selectAllDatabases: () => void;
  clearSelection: () => void;
  addToSearch: (paths: string[]) => void;
  removeFromSearch: (paths: string[]) => void;
  setActiveDatabase: (path: string | null) => void;
  setPanelSplitPct: (pct: number) => void;
  loadVideos: (name: string) => Promise<void>;
  deleteVideo: (databasePath: string, videoId: number) => Promise<void>;
  /** drop an episode whose source file is gone from the searched database a hit came from */
  removeMissingVideo: (database: string, videoPath: string) => Promise<void>;
  addVideo: (videoPath: string) => Promise<{ ok: boolean; message: string | null }>;
  /** `precutScenes` maps a video to the scenes it was already cut into on home; those skip detection */
  addVideos: (
    videoPaths: string[],
    detector?: "transnetv2_gpu" | "keyframe_detection" | "single_scene",
    precutScenes?: Record<string, SceneRange[]>
  ) => Promise<{ ok: boolean; message: string | null }>;
  dismissHero: () => void;
  showHero: () => void;
  unloadModel: () => Promise<void>;
  setQuery: (query: string) => void;
  runSearch: () => Promise<void>;
  clearResults: () => void;
  updateSettings: (changes: Partial<ScoutSearchSettings>) => void;
  backfillThumbnails: (paths: string[]) => void;
  refresh: () => Promise<void>;
  setMode: (mode: ScoutMode) => void;
  /** open the Flow tab with a clip and find the scenes most like its last frame; `pick` asks for databases first */
  startFlowSearch: (source: FlowSource, options?: { pick?: boolean }) => Promise<void>;
  /** re-run the Flow tab's search for the current clip (databases or result count changed) */
  runFlowSearch: () => Promise<void>;
  /** the database prompt's answer: search those, then run the flow or search that was waiting; empty cancels */
  answerDbPrompt: (paths: string[]) => Promise<void>;
  /** interactive in-UI walkthrough sandbox actions (never written to disk or localStorage) */
  startTutorial: () => void;
  tutorialCreateCollection: (name?: string) => void;
  tutorialAddSampleVideos: (selectedUrls?: string[]) => void;
  endTutorial: () => void;
};

const INITIAL: SceneScoutState = {
  status: null,
  databases: [],
  openedDatabase: null,
  videos: [],
  videosByDatabase: {},
  expandedDatabases: {},
  selectedDatabases: [],
  hiddenVideos: [],
  query: "",
  results: [],
  lastQuery: "",
  loading: false,
  searching: false,
  indexing: null,
  error: null,
  settings: DEFAULT_SEARCH_SETTINGS,
  externalPaths: [],
  unloadedPaths: [],
  displayNames: {},
  panelSplitPct: 35,
  heroDismissed: false,
  mode: "search",
  flowFrom: null,
  flowResults: [],
  flowSearching: false,
  flowError: null,
  dbPrompt: null,
  tutorialStep: null,
};

type TutorialSnapshot = Pick<
  SceneScoutState,
  | "databases"
  | "openedDatabase"
  | "videos"
  | "videosByDatabase"
  | "selectedDatabases"
  | "query"
  | "results"
  | "lastQuery"
  | "heroDismissed"
  | "mode"
  | "error"
>;

let tutorialSnapshot: TutorialSnapshot | null = null;
let tutorialDbName = TUTORIAL_DB_NAME;
let tutorialSelectedUrls: string[] | null = null;

// databases already backfilled this session, so a repeat search does not respawn the cli for nothing
const backfilled = new Set<string>();

// bumped per search: a newer search takes over, and an older one's results are dropped when they land
let searchGen = 0;

function fileStem(path: string): string {
  return (path.split(/[/\\]/).pop() ?? path).replace(/\.[^.]+$/, "").toLowerCase();
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Paths are the only stable database identity; names are labels. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  return norm(a) === norm(b);
}

/** True when `path` sits under the storage root (case/separator insensitive). */
function isUnderRoot(path: string, root: string | null | undefined): boolean {
  if (!root) return false;
  const dir = root.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return path.replace(/\\/g, "/").toLowerCase().startsWith(`${dir}/`);
}

type SelectMode = "single" | "toggle" | "range";

/** click, ctrl-click or shift-click selection over an ordered list */
function nextSelection(current: string[], item: string, mode: SelectMode, all: string[]): string[] {
  if (mode === "toggle") {
    return current.includes(item) ? current.filter((p) => p !== item) : [...current, item];
  }
  if (mode === "range" && current.length > 0 && all.length > 0) {
    const startIdx = all.indexOf(current[current.length - 1]);
    const endIdx = all.indexOf(item);
    if (startIdx >= 0 && endIdx >= 0) {
      const range = all.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
      return Array.from(new Set([...current, ...range]));
    }
  }
  return [item];
}

/** why a search or flow can't run yet, or null when it can */
async function searchBlocker(): Promise<string | null> {
  // an empty list makes the CLI fall back to every file in the managed folder, which is not what the panel shows
  if (useSceneScoutStore.getState().selectedDatabases.length === 0) {
    return "Add a database to the Searching list on the left first.";
  }
  if (!(await useAiDepsStore.getState().ensurePack("scout"))) return "Scene Scout needs its AI pack installed.";
  return null;
}

/**
 * the settings a search or flow sends: the Searching list, and the episodes still shown in it.
 * the cli's video filter keeps only the listed videos, so with any hidden every shown one is listed
 */
async function currentSearchSettings(): Promise<ScoutSearchSettings> {
  const store = useSceneScoutStore.getState();
  const { selectedDatabases, hiddenVideos } = store;
  const base = { ...store.settings, selectedDatabases, selectedVideos: [] };
  if (hiddenVideos.length === 0) return base;

  await Promise.all(
    selectedDatabases
      .filter((db) => !useSceneScoutStore.getState().videosByDatabase[db])
      .map((db) => store.loadVideos(db))
  );
  const { videosByDatabase } = useSceneScoutStore.getState();
  const all = selectedDatabases.flatMap((db) => (videosByDatabase[db] ?? []).map((v) => v.filepath));
  const shown = all.filter((path) => !hiddenVideos.some((h) => samePath(h, path)));
  if (shown.length === all.length) return base;
  if (shown.length === 0) throw new Error("Every episode in the searched databases is hidden. Show one with its eye icon.");
  return { ...base, selectedVideos: shown };
}

/** whether there is any database to offer in the picker, loading the list once if it is still empty */
async function hasDatabases(): Promise<boolean> {
  const store = useSceneScoutStore.getState();
  if (store.databases.length === 0) await store.loadDatabases().catch(() => {});
  return useSceneScoutStore.getState().databases.length > 0;
}

/** remembers a database outside the managed folder, which the root listing can't find on its own */
function rememberIfExternal(path: string): void {
  // with no status yet (it takes seconds) the path is kept anyway: loadDatabases drops it again if it is in the root
  const { status, externalPaths } = useSceneScoutStore.getState();
  const isExternal = !status?.root || !isUnderRoot(path, status.root);
  if (isExternal && !externalPaths.some((p) => samePath(p, path))) {
    useSceneScoutStore.setState({ externalPaths: [...externalPaths, path] });
  }
}

/** the panel state with one database forgotten, shared by unload and delete */
function forgetDatabase(state: SceneScoutState, path: string) {
  const expandedDatabases = { ...state.expandedDatabases };
  delete expandedDatabases[path];
  const videosByDatabase = { ...state.videosByDatabase };
  delete videosByDatabase[path];
  const wasOpen = !!state.openedDatabase && samePath(state.openedDatabase, path);
  return {
    selectedDatabases: state.selectedDatabases.filter((p) => !samePath(p, path)),
    expandedDatabases,
    videosByDatabase,
    externalPaths: state.externalPaths.filter((p) => !samePath(p, path)),
    openedDatabase: wasOpen ? null : state.openedDatabase,
    videos: wasOpen ? [] : state.videos,
  };
}

export const useSceneScoutStore = create<SceneScoutState & SceneScoutActions>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      refreshStatus: async () => {
        try {
          set({ status: await scoutStatus(customPath()) });
        } catch (err) {
          // not fatal: databases still list, and the page explains a missing model
          set({ status: null, error: message(err) });
        }
      },

      loadDatabases: async () => {
        if (get().tutorialStep !== null) return;
        // a cached list renders at once and refreshes silently; the spinner is only for an empty panel
        set({ loading: get().databases.length === 0, error: null });
        try {
          const inRoot = await scoutListDatabases(customPath());
          const filteredRoot = inRoot.filter((db) => !get().unloadedPaths.some((p) => samePath(p, db.path)));

          const external = await Promise.all(
            get().externalPaths.map((path) =>
              scoutDatabaseInfo(path, customPath()).catch(() => null)
            )
          );
          const alive = external.filter((d): d is NonNullable<typeof d> => d !== null);

          const databases = [...filteredRoot];
          const externalOnly: string[] = [];
          for (const db of alive) {
            if (inRoot.some((rootDb) => samePath(rootDb.path, db.path))) continue;
            databases.push(db);
            externalOnly.push(db.path);
          }
          set({ databases, externalPaths: externalOnly, loading: false });

          // the opened database can vanish (deleted here or elsewhere); drop its stale video list
          const opened = get().openedDatabase;
          if (opened && !databases.some((d) => samePath(d.path, opened))) {
            set({ openedDatabase: null, videos: [] });
          }

          // persisted "Search in" chips must never point at a database that is gone
          const settings = get().settings;
          const kept = settings.selectedDatabases.filter((p) =>
            databases.some((d) => samePath(d.path, p))
          );
          if (kept.length !== settings.selectedDatabases.length) {
            set({ settings: { ...settings, selectedDatabases: kept } });
          }
          // same for the Searching list: a gone path counted there but showed nothing and blocked the prompt
          const searching = get().selectedDatabases;
          const stillThere = searching.filter((p) => databases.some((d) => samePath(d.path, p)));
          if (stillThere.length !== searching.length) set({ selectedDatabases: stillThere });
        } catch (err) {
          set({ loading: false, error: message(err) });
        }
      },

      /** `pathOrName` is a full path when the user picked a location themselves */
      createDatabase: async (pathOrName) => {
        if (get().tutorialStep !== null) {
          get().tutorialCreateCollection(pathOrName);
          return { ok: true, message: null, path: TUTORIAL_DB_PATH };
        }
        try {
          const created = await scoutCreateDatabase(pathOrName, customPath());
          rememberIfExternal(created.path);
          // shown at once; the full listing (one cli run per external database) refreshes behind it
          set((state) => ({
            databases: state.databases.some((d) => samePath(d.path, created.path))
              ? state.databases
              : [...state.databases, created],
          }));
          void get().loadDatabases();
          return { ok: true, message: null, path: created.path };
        } catch (err) {
          return { ok: false, message: message(err), path: null };
        }
      },

      openExistingDatabase: async (filePath) => {
        const appState = useAppStateStore.getState();
        const baseName = filePath.split(/[/\\]/).pop() || filePath;
        appState.setActiveOperation("scout_open");
        appState.setLoading(true);
        appState.setProgressMsg(`Opening database ${baseName}…`);
        try {
          const db = await scoutOpenDatabase(filePath, customPath());
          rememberIfExternal(db.path);

          if (get().unloadedPaths.some((p) => samePath(p, db.path))) {
            set({ unloadedPaths: get().unloadedPaths.filter((p) => !samePath(p, db.path)) });
          }

          await get().loadDatabases();
          await get().openDatabase(db.path);
          get().selectDatabase(db.path, "single");
          appState.setProgressMsg("Database loaded successfully");
          // databases made elsewhere may lack stored thumbnails; write them in once
          get().backfillThumbnails([db.path]);
          await new Promise((r) => setTimeout(r, 600));
          return { ok: true, message: null, database: db };
        } catch (err) {
          return { ok: false, message: message(err) };
        } finally {
          appState.setActiveOperation(null);
          appState.setLoading(false);
          appState.setProgressMsg("");
        }
      },

      /** the label shown in the panel, which is separate from the file name */
      renameDatabase: (path, displayName) => {
        if (get().tutorialStep !== null) return;
        set((state) => ({
          displayNames: { ...state.displayNames, [path]: displayName },
        }));
      },

      unloadDatabase: (path) => {
        set((state) => {
          // a database in the managed folder would come back with the next listing unless it is remembered as unloaded
          const hideFromListing =
            isUnderRoot(path, state.status?.root) && !state.unloadedPaths.some((p) => samePath(p, path));
          return {
            ...forgetDatabase(state, path),
            databases: state.databases.filter((d) => !samePath(d.path, path)),
            unloadedPaths: hideFromListing ? [...state.unloadedPaths, path] : state.unloadedPaths,
          };
        });
      },

      deleteDatabase: async (name) => {
        try {
          await scoutDeleteDatabase(name, customPath());
          set((state) => ({
            ...forgetDatabase(state, name),
            unloadedPaths: state.unloadedPaths.filter((p) => !samePath(p, name)),
          }));
          await get().loadDatabases();
        } catch (err) {
          set({ error: message(err) });
        }
      },

      openDatabase: async (name) => {
        if (get().tutorialStep !== null) {
          set({ openedDatabase: name });
          return;
        }
        set({ openedDatabase: name, videos: [] });
        if (name) await get().loadVideos(name);
      },

      toggleDatabaseExpanded: async (path) => {
        const isExp = Boolean(get().expandedDatabases[path]);
        set((state) => ({
          expandedDatabases: {
            ...state.expandedDatabases,
            [path]: !isExp,
          },
        }));
        if (!isExp && !get().videosByDatabase[path]) {
          await get().loadVideos(path);
        }
      },

      selectDatabase: (path, mode = "single", allPaths = []) => {
        const nextSelected = nextSelection(get().selectedDatabases, path, mode, allPaths);
        set({
          selectedDatabases: nextSelected,
          openedDatabase: nextSelected.length === 1 ? nextSelected[0] : get().openedDatabase,
        });
      },

      setVideosHidden: (paths, hidden) => {
        const rest = get().hiddenVideos.filter((h) => !paths.some((p) => samePath(p, h)));
        set({ hiddenVideos: hidden ? [...rest, ...paths] : rest });
      },

      selectAllDatabases: () => {
        set({ selectedDatabases: get().databases.map((d) => d.path) });
      },

      clearSelection: () => {
        set({ selectedDatabases: [] });
      },

      addToSearch: (paths) => {
        const current = get().selectedDatabases;
        const added = paths.filter((p) => !current.some((c) => samePath(c, p)));
        if (added.length) set({ selectedDatabases: [...current, ...added] });
      },

      removeFromSearch: (paths) => {
        const removed = (p: string) => paths.some((r) => samePath(r, p));
        set({ selectedDatabases: get().selectedDatabases.filter((p) => !removed(p)) });
      },

      setActiveDatabase: (path) => set({ openedDatabase: path }),

      dismissHero: () => set({ heroDismissed: true }),
      showHero: () => set({ heroDismissed: false }),

      setPanelSplitPct: (pct) => set({ panelSplitPct: Math.min(85, Math.max(15, pct)) }),

      loadVideos: async (name) => {
        try {
          const v = await scoutListVideos(name, customPath());
          set((state) => ({
            videos: v,
            videosByDatabase: { ...state.videosByDatabase, [name]: v },
          }));
        } catch (err) {
          set((state) => ({
            videos: [],
            videosByDatabase: { ...state.videosByDatabase, [name]: [] },
            error: message(err),
          }));
        }
      },

      deleteVideo: async (databasePath, videoId) => {
        try {
          const currentVideos = get().videosByDatabase[databasePath] || [];
          const deletedVideo = currentVideos.find((v) => v.id === videoId);
          const deletedFilePath = deletedVideo?.filepath;
          const scenesToRemove = deletedVideo?.sceneCount || 0;

          await scoutDeleteVideo(databasePath, videoId, customPath());

          set((state) => {
            const nextVideos = (state.openedDatabase && samePath(state.openedDatabase, databasePath))
              ? state.videos.filter((v) => v.id !== videoId)
              : state.videos;

            const nextDbVideos = (state.videosByDatabase[databasePath] || []).filter((v) => v.id !== videoId);
            const nextVByDb = {
              ...state.videosByDatabase,
              [databasePath]: nextDbVideos,
            };

            const nextDatabases = state.databases.map((db) => {
              if (samePath(db.path, databasePath)) {
                return {
                  ...db,
                  videoCount: Math.max(0, db.videoCount - 1),
                  sceneCount: Math.max(0, db.sceneCount - scenesToRemove),
                };
              }
              return db;
            });

            const keepHit = (hit: ScoutHit) => !deletedFilePath || !samePath(hit.videoPath, deletedFilePath);

            return {
              videos: nextVideos,
              videosByDatabase: nextVByDb,
              databases: nextDatabases,
              results: state.results.filter(keepHit),
              flowResults: state.flowResults.filter(keepHit),
            };
          });

          if (deletedFilePath) {
            const appClips = useAppStateStore.getState().clips;
            const filteredClips = appClips.filter((clip) => !samePath(clip.src, deletedFilePath));
            if (filteredClips.length !== appClips.length) {
              useAppStateStore.getState().setClips(filteredClips);
            }
          }

          // the lists above are already right; this only re-syncs counts, so the caller never waits on it
          void get().loadDatabases();
        } catch (err) {
          set({ error: message(err) });
        }
      },

      removeMissingVideo: async (database, videoPath) => {
        // hits name their database by file stem, so map back to the searched paths
        const databasePaths = get().selectedDatabases.filter((p) => fileStem(p) === database.toLowerCase());
        for (const databasePath of databasePaths) {
          try {
            const videos = await scoutListVideos(databasePath, customPath());
            set((state) => ({ videosByDatabase: { ...state.videosByDatabase, [databasePath]: videos } }));
            const video = videos.find((v) => samePath(v.filepath, videoPath));
            if (video) await get().deleteVideo(databasePath, video.id);
          } catch (err) {
            set({ error: message(err) });
          }
        }
      },

      addVideo: async (videoPath) => {
        return get().addVideos([videoPath]);
      },

      addVideos: async (videoPaths, detectorArg, precutScenes) => {
        if (!videoPaths.length) return { ok: true, message: null };
        if (get().tutorialStep !== null) {
          get().tutorialAddSampleVideos(videoPaths);
          return { ok: true, message: null };
        }
        // remembered for scene scout only, so it never changes the home import default
        if (detectorArg) set({ settings: { ...get().settings, lastIndexDetection: detectorArg } });
        const database = get().openedDatabase || get().selectedDatabases[0];
        if (!database) return { ok: false, message: "Select or open a database first." };

        // one long job at a time: asks to stop whatever runs, or keeps it and drops this one
        if (!(await claimProcess("scout_add"))) return { ok: false, message: null };

        if (!(await useAiDepsStore.getState().ensurePack("scout"))) {
          return { ok: false, message: "Scene Scout needs its AI pack installed." };
        }

        const totalVideos = videoPaths.length;
        console.log(`SCOUT|queue starting queue of ${totalVideos} videos`);
        importAbortRef.current = false;

        const appState = useAppStateStore.getState();
        appState.setActiveOperation("scout_add");
        appState.setLoading(true);
        appState.setBatchTotal(totalVideos);
        appState.setBatchDone(0);
        appState.setProgress(0);
        appState.setProgressMsg("Initializing Scene Scout…");

        let stopListener: (() => void) | null = null;
        let runsDetection = false;
        // late stderr lines can arrive after the next stage started, so the bar never moves back
        const advance = (pct: number) => {
          appState.setProgress(Math.max(useAppStateStore.getState().progress, Math.round(pct)));
        };
        const fraction = (done: number, total: number) => (total > 0 ? done / total : 0);

        try {
          stopListener = await listen<ScoutIndexProgress>("scout_progress", (e) => {
            const { stage, done, total } = e.payload;
            const currentVideo = get().indexing?.video;
            if (currentVideo) {
              set({
                indexing: {
                  video: currentVideo,
                  stage,
                  done,
                  total,
                },
              });
            }

            if (stage === "loading_model") {
              appState.setLoading(true);
              const pct = total > 1 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : null;
              appState.setProgressMsg(pct !== null && pct > 0 ? `Loading AI model… (${pct}%)` : "Loading AI model…");
              if (pct !== null && useAppStateStore.getState().progress < pct) {
                advance(pct);
              }
              useAppStateStore.setState((s) => ({ ...s, bgProgress: null }));
            } else if (stage === "detecting") {
              appState.setProgressMsg("Detecting scenes…");
              if (runsDetection) {
                advance(Math.min(1, fraction(done, AI_DETECTION_DONE_PERCENT)) * AI_DETECTION_SHARE);
              }
            } else if (stage === "sampling") {
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const [from, to] = runsDetection ? [AI_DETECTION_SHARE, 95] : [0, 80];
              advance(from + fraction(done, total) * (to - from));
              appState.setProgressMsg(
                done > 0
                  ? `Reading scene frames ${done}/${total} (${pct}%)`
                  : `Reading ${total} scene frames…`
              );
              useAppStateStore.setState((s) => ({
                ...s,
                bgProgress: { done, total },
              }));
            } else if (stage === "embedding") {
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const from = runsDetection ? 95 : 80;
              advance(from + fraction(done, total) * (100 - from));
              appState.setProgressMsg(`Scanning scenes ${done}/${total} (${pct}%)`);
              useAppStateStore.setState((s) => ({
                ...s,
                bgProgress: { done, total },
              }));
            } else if (stage === "done") {
              appState.setProgress(100);
              appState.setProgressMsg("Scenes ready to search");
            }
          });

          const detector =
            detectorArg ??
            get().settings.lastIndexDetection ??
            useGeneralSettingsStore.getState().sceneDetectionMethod;
          const cutToLibrary = get().settings.cutToLibrary !== false;
          const folderName =
            get().displayNames[database] ??
            get().databases.find((d) => samePath(d.path, database))?.name ??
            fileStem(database);
          for (let i = 0; i < totalVideos; i++) {
            const videoPath = videoPaths[i];
            const name = videoPath.split(/[/\\]/).pop() || videoPath;
            console.log(`SCOUT|queue [${i + 1}/${totalVideos}] indexing ${name}`);
            appState.setBatchDone(i);
            appState.setBatchCurrentFile(name);
            appState.setProgress(0);
            appState.setProgressMsg(
              totalVideos > 1
                ? `[${i + 1}/${totalVideos}] Starting ${name}…`
                : `Starting ${name}…`
            );
            useAppStateStore.setState((s) => ({
              ...s,
              bgProgress: null,
            }));

            set({
              indexing: {
                video: videoPath,
                stage: totalVideos > 1 ? `video ${i + 1}/${totalVideos}: starting` : "starting",
                done: 0,
                total: 1,
              },
            });

            let scenes = precutScenes?.[videoPath] ?? null;
            if (!scenes && cutToLibrary && detector !== "single_scene") {
              // detection runs once, in the library import; the index reuses its scenes
              appState.setProgressMsg(`Cutting ${name} into the library…`);
              scenes = await cutIntoLibrary(videoPath, folderName, detector);
              // a ✕ in the moment between the cut and indexing still stops the whole add
              if (importAbortRef.current) throw new Error(DETECT_CANCELED);
              appState.setProgress(0);
            }
            runsDetection = detector === "transnetv2_gpu" && !scenes;
            await scoutAddVideo(database, videoPath, detector, customPath(), scenes);
            console.log(`SCOUT|queue [${i + 1}/${totalVideos}] completed ${name}`);
          }
          await Promise.all([get().loadVideos(database), get().loadDatabases()]);
          console.log(`SCOUT|queue all ${totalVideos} videos indexed successfully`);
          return { ok: true, message: null };
        } catch (err) {
          // finished episodes stay; the half-indexed one it stopped on is removed
          await discardUnfinishedVideos(database);
          await Promise.all([get().loadVideos(database), get().loadDatabases()]);
          if (isScoutCanceled(err) || message(err) === DETECT_CANCELED) {
            console.log("SCOUT|queue stopped by the user");
            return { ok: false, message: null };
          }
          console.error("SCOUT|queue error", err);
          return { ok: false, message: message(err) };
        } finally {
          if (stopListener) {
            stopListener();
          }
          set({ indexing: null });
          useAppStateStore.setState((s) => ({
            ...s,
            loading: false,
            activeOperation: null,
            bgProgress: null,
            batchTotal: 0,
            batchDone: 0,
            batchCurrentFile: null,
          }));
        }
      },

      unloadModel: async () => {
        try {
          await scoutUnloadModel(customPath());
        } catch (err) {
          console.error("SCOUT|unload failed", err);
        }
      },

      setQuery: (query) => set({ query }),

      runSearch: async () => {
        const query = get().query.trim();
        if (!query) return;
        if (get().tutorialStep !== null) {
          const results = searchTutorialHits(query, tutorialDbName, tutorialSelectedUrls);
          set({
            results,
            lastQuery: query,
            heroDismissed: true,
            searching: false,
            error: null,
            tutorialStep: 3,
          });
          return;
        }
        // nothing to search in: ask which databases, the answer runs this search
        if (get().selectedDatabases.length === 0 && (await hasDatabases())) {
          set({ dbPrompt: { kind: "search" } });
          return;
        }
        const blocker = await searchBlocker();
        if (blocker) {
          set({ error: blocker });
          return;
        }

        const gen = ++searchGen;
        set({ searching: true, error: null, heroDismissed: true });
        try {
          const searchSettings = await currentSearchSettings();
          const results = await withModelLoadingCard(() => scoutSearch(query, searchSettings, customPath()));
          if (gen !== searchGen) return;
          set({ results, lastQuery: query });
          prioritizeHits(results);

          // hits name their database by file stem, so map back to the searched paths
          const missing = new Set(results.filter((h) => !h.thumbnailB64).map((h) => h.database.toLowerCase()));
          if (missing.size) {
            get().backfillThumbnails(get().selectedDatabases.filter((p) => missing.has(fileStem(p))));
          }
        } catch (err) {
          if (gen === searchGen) set({ results: [], error: message(err) });
        } finally {
          if (gen === searchGen) set({ searching: false });
        }
      },

      clearResults: () => set({ results: [], lastQuery: "", query: "" }),

      updateSettings: (changes) =>
        set((state) => ({ settings: { ...state.settings, ...changes } })),

      /** fills missing thumbnails in the background: no loading card, once per database per session */
      backfillThumbnails: (paths) => {
        for (const path of paths) {
          const key = path.toLowerCase();
          if (backfilled.has(key)) continue;
          backfilled.add(key);
          void scoutGenerateThumbnails(path, customPath())
            .then((res) => console.log(`SCOUT|thumbs backfilled ${res.generated} into ${path}`))
            .catch((err) => {
              // a failed run may be retried later this session
              backfilled.delete(key);
              console.error("SCOUT|thumbs backfill failed", err);
            });
        }
      },

      /** re-reads everything from disk, for the toolbar's refresh button */
      refresh: async () => {
        await Promise.all([get().loadDatabases(), get().refreshStatus()]);
        const opened = get().openedDatabase;
        if (opened) await get().loadVideos(opened);
      },

      setMode: (mode) => set({ mode }),

      startFlowSearch: async (source, options) => {
        // asked for, or nothing in the Searching list: pick the databases rather than failing with a hint
        if ((options?.pick || get().selectedDatabases.length === 0) && (await hasDatabases())) {
          set({ dbPrompt: { kind: "flow", source } });
          return;
        }
        // using flow ends the first-visit layout for both tabs, exactly like the first search does
        set({ heroDismissed: true, mode: "flow", flowFrom: source, flowResults: [], flowError: null });
        useUIStateStore.getState().setActivePage("sceneScout");
        await get().runFlowSearch();
      },

      answerDbPrompt: async (paths) => {
        const prompt = get().dbPrompt;
        set({ dbPrompt: null });
        if (!prompt || paths.length === 0) return;
        set({
          selectedDatabases: paths,
          openedDatabase: paths.length === 1 ? paths[0] : get().openedDatabase,
        });
        if (prompt.kind === "flow") await get().startFlowSearch(prompt.source);
        else await get().runSearch();
      },

      runFlowSearch: async () => {
        const source = get().flowFrom;
        if (!source) return;
        const blocker = await searchBlocker();
        if (blocker) {
          set({ flowError: blocker });
          return;
        }

        set({ flowSearching: true, flowError: null });
        try {
          const flowSettings = await currentSearchSettings();
          const flowResults = await withModelLoadingCard(() => scoutSearch("", flowSettings, customPath(), source));
          if (get().flowFrom === source) {
            set({ flowResults });
            prioritizeHits(flowResults);
          }
        } catch (err) {
          if (get().flowFrom === source) set({ flowResults: [], flowError: message(err) });
        } finally {
          set({ flowSearching: false });
        }
      },
      startTutorial: () => {
        const s = get();
        if (s.tutorialStep === null) {
          tutorialSnapshot = {
            databases: s.databases,
            openedDatabase: s.openedDatabase,
            videos: s.videos,
            videosByDatabase: s.videosByDatabase,
            selectedDatabases: s.selectedDatabases,
            query: s.query,
            results: s.results,
            lastQuery: s.lastQuery,
            heroDismissed: s.heroDismissed,
            mode: s.mode,
            error: s.error,
          };
        }
        set({
          tutorialStep: 0,
          loading: false,
          databases: [],
          openedDatabase: null,
          videos: [],
          videosByDatabase: {},
          selectedDatabases: [],
          query: "",
          results: [],
          lastQuery: "",
          heroDismissed: false,
          mode: "search",
          error: null,
        });
      },

      tutorialCreateCollection: (rawName) => {
        const cleaned = (rawName ?? "")
          .split(/[/\\]/)
          .pop()
          ?.replace(/\.scoutdb$/i, "")
          .trim();
        tutorialDbName = cleaned || TUTORIAL_DB_NAME;
        tutorialSelectedUrls = null;
        const db = makeTutorialDatabase(0, tutorialDbName);
        set({
          databases: [db],
          openedDatabase: TUTORIAL_DB_PATH,
          selectedDatabases: [TUTORIAL_DB_PATH],
          videos: [],
          videosByDatabase: { [TUTORIAL_DB_PATH]: [] },
          tutorialStep: 1,
          error: null,
        });
      },

      tutorialAddSampleVideos: (selectedUrls) => {
        tutorialSelectedUrls = selectedUrls && selectedUrls.length > 0 ? selectedUrls : null;
        const demoVideos = makeTutorialVideos(tutorialSelectedUrls);
        const db = makeTutorialDatabase(demoVideos.length, tutorialDbName);
        set({
          databases: [db],
          openedDatabase: TUTORIAL_DB_PATH,
          selectedDatabases: [TUTORIAL_DB_PATH],
          videos: demoVideos,
          videosByDatabase: { [TUTORIAL_DB_PATH]: demoVideos },
          tutorialStep: 2,
          error: null,
        });
      },

      endTutorial: () => {
        if (get().tutorialStep === null) return;
        const snap = tutorialSnapshot;
        tutorialSnapshot = null;
        tutorialDbName = TUTORIAL_DB_NAME;
        tutorialSelectedUrls = null;
        if (snap) {
          set({ ...snap, tutorialStep: null });
        } else {
          set({ tutorialStep: null });
        }
        const appState = useAppStateStore.getState();
        appState.setFocusedClip(null);
        appState.setFocusedClipId(null);
        appState.setSelectedClips(new Set());
      },
    }),
    {
      name: "amverge.scenescout.v1",
      // results and status are re-read on open; a stale copy would be worse than none
      partialize: (state) => {
        const live = state.tutorialStep !== null && tutorialSnapshot ? tutorialSnapshot : state;
        return {
          settings: state.settings,
          openedDatabase: live.openedDatabase,
          // drawn on mount instead of waiting on a cli spawn, then re-read from disk
          databases: live.databases,
          selectedDatabases: live.selectedDatabases,
          hiddenVideos: state.hiddenVideos,
          externalPaths: state.externalPaths,
          unloadedPaths: state.unloadedPaths,
          displayNames: state.displayNames,
          panelSplitPct: state.panelSplitPct,
        };
      },
    }
  )
);
