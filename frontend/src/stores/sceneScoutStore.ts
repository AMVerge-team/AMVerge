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
import { useAiDepsStore } from "./aiDepsStore";
import { useAppStateStore } from "./appStore";
import { useGeneralSettingsStore } from "./settingsStore";
import { useUIStateStore } from "./UIStore";

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
    cardOpened = true;
    appState.setActiveOperation("scout_search");
    appState.setLoading(true);
    appState.setProgress(0);
    appState.setProgressMsg("Loading SigLIP 2 model weights…");
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
  selectedVideos: string[];

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
};

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
  selectVideo: (videoPath: string, parentDbPath: string, mode?: SelectMode, allVideoPaths?: string[]) => void;
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
    detector?: "transnetv2_gpu" | "keyframe_detection",
    precutScenes?: Record<string, SceneRange[]>
  ) => Promise<{ ok: boolean; message: string | null }>;
  dismissHero: () => void;
  unloadModel: () => Promise<void>;
  setQuery: (query: string) => void;
  runSearch: () => Promise<void>;
  clearResults: () => void;
  updateSettings: (changes: Partial<ScoutSearchSettings>) => void;
  generateThumbnails: (path: string) => Promise<{ ok: boolean; generated: number; message: string | null }>;
  backfillThumbnails: (paths: string[]) => void;
  refresh: () => Promise<void>;
  setMode: (mode: ScoutMode) => void;
  /** open the Flow tab with a clip and find the scenes most like its last frame */
  startFlowSearch: (source: FlowSource) => Promise<void>;
  /** re-run the Flow tab's search for the current clip (databases or result count changed) */
  runFlowSearch: () => Promise<void>;
};

const INITIAL: SceneScoutState = {
  status: null,
  databases: [],
  openedDatabase: null,
  videos: [],
  videosByDatabase: {},
  expandedDatabases: {},
  selectedDatabases: [],
  selectedVideos: [],
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
};

// databases already backfilled this session, so a repeat search does not respawn the cli for nothing
const backfilled = new Set<string>();

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

/** remembers a database outside the managed folder, which the root listing can't find on its own */
async function rememberIfExternal(path: string): Promise<void> {
  const store = useSceneScoutStore.getState();
  // a null root must not misclassify an in-root database as external
  if (!store.status) await store.refreshStatus();
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
        } catch (err) {
          set({ loading: false, error: message(err) });
        }
      },

      /** `pathOrName` is a full path when the user picked a location themselves */
      createDatabase: async (pathOrName) => {
        try {
          const created = await scoutCreateDatabase(pathOrName, customPath());
          await rememberIfExternal(created.path);
          await get().loadDatabases();
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
          await rememberIfExternal(db.path);

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
      renameDatabase: (path, displayName) =>
        set((state) => ({
          displayNames: { ...state.displayNames, [path]: displayName },
        })),

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
          selectedVideos: [],
          openedDatabase: nextSelected.length === 1 ? nextSelected[0] : get().openedDatabase,
        });
      },

      selectVideo: (videoPath, parentDbPath, mode = "single", allVideoPaths = []) => {
        // episode picks narrow the search; which databases are searched stays as is
        set({
          selectedVideos: nextSelection(get().selectedVideos, videoPath, mode, allVideoPaths),
          openedDatabase: parentDbPath,
        });
      },

      selectAllDatabases: () => {
        set({
          selectedDatabases: get().databases.map((d) => d.path),
          selectedVideos: [],
        });
      },

      clearSelection: () => {
        set({
          selectedDatabases: [],
          selectedVideos: [],
        });
      },

      addToSearch: (paths) => {
        const current = get().selectedDatabases;
        const added = paths.filter((p) => !current.some((c) => samePath(c, p)));
        if (added.length) set({ selectedDatabases: [...current, ...added] });
      },

      removeFromSearch: (paths) => {
        const { selectedDatabases, selectedVideos, videosByDatabase } = get();
        const removed = (p: string) => paths.some((r) => samePath(r, p));
        // episode picks inside a database that is no longer searched would filter out everything else
        const droppedVideos = new Set(
          Object.entries(videosByDatabase)
            .filter(([db]) => removed(db))
            .flatMap(([, vids]) => vids.map((v) => v.filepath.toLowerCase()))
        );
        set({
          selectedDatabases: selectedDatabases.filter((p) => !removed(p)),
          selectedVideos: selectedVideos.filter((v) => !droppedVideos.has(v.toLowerCase())),
        });
      },

      setActiveDatabase: (path) => set({ openedDatabase: path }),

      dismissHero: () => set({ heroDismissed: true }),

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

            const nextSelectedVideos = deletedFilePath
              ? state.selectedVideos.filter((vp) => !samePath(vp, deletedFilePath))
              : state.selectedVideos;

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
              selectedVideos: nextSelectedVideos,
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

        const appState = useAppStateStore.getState();
        appState.setActiveOperation("scout_add");
        appState.setLoading(true);
        appState.setBatchTotal(totalVideos);
        appState.setBatchDone(0);
        appState.setProgress(0);
        appState.setProgressMsg("Initializing Scene Scout…");

        let stopListener: (() => void) | null = null;

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
              appState.setProgressMsg("Loading SigLIP 2 model weights…");
              appState.setProgress(0);
              useAppStateStore.setState((s) => ({ ...s, bgProgress: null }));
            } else if (stage === "detecting") {
              appState.setProgressMsg("Detecting scenes…");
              appState.setProgress(10);
            } else if (stage === "sampling") {
              // the cli streams sampling progress, so it fills its own 10..20 slice of the bar
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              appState.setProgress(10 + Math.round(pct / 10));
              appState.setProgressMsg(
                done > 0
                  ? `Sampling representative frames ${done}/${total} (${pct}%)`
                  : `Sampling ${total} representative frames…`
              );
              useAppStateStore.setState((s) => ({
                ...s,
                bgProgress: { done, total },
              }));
            } else if (stage === "embedding") {
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const currentProgress = Math.min(100, Math.max(0, 20 + Math.round((pct * 80) / 100)));
              appState.setProgress(currentProgress);
              appState.setProgressMsg(`Embedding scenes ${done}/${total} (${pct}%)`);
              useAppStateStore.setState((s) => ({
                ...s,
                bgProgress: { done, total },
              }));
            } else if (stage === "done") {
              appState.setProgress(100);
              appState.setProgressMsg("Indexed scenes successfully");
            }
          });

          const detector =
            detectorArg ??
            get().settings.lastIndexDetection ??
            useGeneralSettingsStore.getState().sceneDetectionMethod;
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

            await scoutAddVideo(database, videoPath, detector, customPath(), precutScenes?.[videoPath] ?? null);
            console.log(`SCOUT|queue [${i + 1}/${totalVideos}] completed ${name}`);
          }
          await Promise.all([get().loadVideos(database), get().loadDatabases()]);
          console.log(`SCOUT|queue all ${totalVideos} videos indexed successfully`);
          return { ok: true, message: null };
        } catch (err) {
          // finished episodes stay; the half-indexed one it stopped on is removed
          await discardUnfinishedVideos(database);
          await Promise.all([get().loadVideos(database), get().loadDatabases()]);
          if (isScoutCanceled(err)) {
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
        const blocker = await searchBlocker();
        if (blocker) {
          set({ error: blocker });
          return;
        }

        set({ searching: true, error: null });
        try {
          const searchSettings = {
            ...get().settings,
            selectedDatabases: get().selectedDatabases,
            selectedVideos: get().selectedVideos,
          };
          const results = await withModelLoadingCard(() => scoutSearch(query, searchSettings, customPath()));
          set({ results, lastQuery: query });

          // hits name their database by file stem, so map back to the searched paths
          const missing = new Set(results.filter((h) => !h.thumbnailB64).map((h) => h.database.toLowerCase()));
          if (missing.size) {
            get().backfillThumbnails(get().selectedDatabases.filter((p) => missing.has(fileStem(p))));
          }
        } catch (err) {
          set({ results: [], error: message(err) });
        } finally {
          set({ searching: false });
        }
      },

      clearResults: () => set({ results: [], lastQuery: "", query: "" }),

      updateSettings: (changes) =>
        set((state) => ({ settings: { ...state.settings, ...changes } })),

      generateThumbnails: async (path: string) => {
        if (!(await claimProcess("scout_thumbnails"))) return { ok: false, generated: 0, message: null };
        let stopListening: (() => void) | null = null;
        try {
          const appState = useAppStateStore.getState();
          appState.setActiveOperation("scout_thumbnails");
          appState.setLoading(true);
          appState.setProgress(0);
          appState.setProgressMsg("Finding missing and low-resolution thumbnails…");

          // the cli reports every frame it decodes, so the bar moves throughout a long season
          stopListening = await listen<ScoutIndexProgress>("scout_progress", (e) => {
            const { stage, done, total } = e.payload;
            if (stage !== "thumbnails" || total <= 0) return;
            appState.setProgress(Math.round((done / total) * 100));
            appState.setProgressMsg(`Generating thumbnails ${done}/${total}`);
          });

          const res = await scoutGenerateThumbnails(path, customPath(), true);
          await get().loadDatabases();
          return { ok: true, generated: res.generated, message: null };
        } catch (err) {
          // closing the window pauses: finished episodes are saved and the next run carries on
          if (isScoutCanceled(err)) {
            console.log("SCOUT|thumbs paused; generating again resumes from the next episode");
            return { ok: false, generated: 0, message: null };
          }
          return { ok: false, generated: 0, message: message(err) };
        } finally {
          stopListening?.();
          const appState = useAppStateStore.getState();
          appState.setActiveOperation(null);
          appState.setLoading(false);
          appState.setProgress(0);
          appState.setProgressMsg("");
        }
      },

      /** silent, background version of generateThumbnails: no loading card, once per database per session */
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

      startFlowSearch: async (source) => {
        // using flow ends the first-visit layout for both tabs, exactly like the first search does
        set({ heroDismissed: true, mode: "flow", flowFrom: source, flowResults: [], flowError: null });
        useUIStateStore.getState().setActivePage("sceneScout");
        await get().runFlowSearch();
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
          const flowSettings = {
            ...get().settings,
            selectedDatabases: get().selectedDatabases,
            selectedVideos: get().selectedVideos,
          };
          const flowResults = await withModelLoadingCard(() => scoutSearch("", flowSettings, customPath(), source));
          if (get().flowFrom === source) set({ flowResults });
        } catch (err) {
          if (get().flowFrom === source) set({ flowResults: [], flowError: message(err) });
        } finally {
          set({ flowSearching: false });
        }
      },
    }),
    {
      name: "amverge.scenescout.v1",
      // results and status are re-read on open; a stale copy would be worse than none
      partialize: (state) => ({
        settings: state.settings,
        openedDatabase: state.openedDatabase,
        // drawn on mount instead of waiting on a cli spawn, then re-read from disk
        databases: state.databases,
        selectedDatabases: state.selectedDatabases,
        externalPaths: state.externalPaths,
        unloadedPaths: state.unloadedPaths,
        displayNames: state.displayNames,
        panelSplitPct: state.panelSplitPct,
      }),
    }
  )
);
