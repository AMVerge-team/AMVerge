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
} from "../features/sceneScout/api";
import {
  DEFAULT_SEARCH_SETTINGS,
  type ScoutDatabase,
  type ScoutHit,
  type ScoutIndexProgress,
  type ScoutSearchSettings,
  type ScoutStatus,
  type ScoutVideo,
} from "../features/sceneScout/types";
import { useAiDepsStore } from "./aiDepsStore";
import { useAppStateStore } from "./appStore";
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

  /** absolute paths of databases the user saved outside the managed folder.
   *  they never show up in the root listing, so the app has to remember them */
  externalPaths: string[];
  unloadedPaths: string[];
  displayNames: Record<string, string>;
  /** height of the panel's searching box, as a percent of the two boxes together */
  panelSplitPct: number;
};

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
  selectDatabase: (path: string, mode?: "single" | "toggle" | "range", allPaths?: string[]) => void;
  selectVideo: (videoPath: string, parentDbPath: string, mode?: "single" | "toggle" | "range", allVideoPaths?: string[]) => void;
  selectAllDatabases: () => void;
  clearSelection: () => void;
  addToSearch: (paths: string[]) => void;
  removeFromSearch: (paths: string[]) => void;
  setActiveDatabase: (path: string | null) => void;
  setPanelSplitPct: (pct: number) => void;
  loadVideos: (name: string) => Promise<void>;
  deleteVideo: (databasePath: string, videoId: number) => Promise<void>;
  addVideo: (videoPath: string) => Promise<{ ok: boolean; message: string | null }>;
  addVideos: (videoPaths: string[]) => Promise<{ ok: boolean; message: string | null }>;
  unloadModel: () => Promise<void>;
  setQuery: (query: string) => void;
  runSearch: () => Promise<void>;
  clearResults: () => void;
  updateSettings: (changes: Partial<ScoutSearchSettings>) => void;
  generateThumbnails: (path: string) => Promise<{ ok: boolean; generated: number; message: string | null }>;
  refresh: () => Promise<void>;
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
};

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

          // the opened database can vanish (deleted here or elsewhere), and a
          // panel pointing at nothing would keep showing its stale video list
          const opened = get().openedDatabase;
          if (opened && !databases.some((d) => samePath(d.path, opened))) {
            set({ openedDatabase: null, videos: [] });
          }

          // "Search in" selections persist; drop any that no longer resolve to
          // a real database so the chips never point at nothing
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

          // status may still be mid round-trip on a freshly opened page, and a
          // null root must not misclassify an in-root database as external
          if (!get().status) await get().refreshStatus();

          // remember it only when it landed outside the managed folder, which is
          // the case the root listing cannot find on its own
          const root = get().status?.root;
          const isExternal = !root || !isUnderRoot(created.path, root);
          if (isExternal && !get().externalPaths.some((p) => samePath(p, created.path))) {
            set({ externalPaths: [...get().externalPaths, created.path] });
          }

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

          if (!get().status) await get().refreshStatus();

          const root = get().status?.root;
          const isExternal = !root || !isUnderRoot(db.path, root);
          if (isExternal && !get().externalPaths.some((p) => samePath(p, db.path))) {
            set({ externalPaths: [...get().externalPaths, db.path] });
          }

          if (get().unloadedPaths.some((p) => samePath(p, db.path))) {
            set({ unloadedPaths: get().unloadedPaths.filter((p) => !samePath(p, db.path)) });
          }

          await get().loadDatabases();
          await get().openDatabase(db.path);
          get().selectDatabase(db.path, "single");
          appState.setProgressMsg("Database loaded successfully");
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
          const nextSelected = state.selectedDatabases.filter((p) => !samePath(p, path));
          const nextExpanded = { ...state.expandedDatabases };
          delete nextExpanded[path];
          const nextVByDb = { ...state.videosByDatabase };
          delete nextVByDb[path];
          const nextExternal = state.externalPaths.filter((p) => !samePath(p, path));

          const root = state.status?.root;
          const isUnderManagedRoot = root && isUnderRoot(path, root);
          const nextUnloaded = isUnderManagedRoot && !state.unloadedPaths.some((p) => samePath(p, path))
            ? [...state.unloadedPaths, path]
            : state.unloadedPaths;

          const nextDatabases = state.databases.filter((d) => !samePath(d.path, path));

          return {
            databases: nextDatabases,
            selectedDatabases: nextSelected,
            expandedDatabases: nextExpanded,
            videosByDatabase: nextVByDb,
            externalPaths: nextExternal,
            unloadedPaths: nextUnloaded,
            openedDatabase: state.openedDatabase && samePath(state.openedDatabase, path) ? null : state.openedDatabase,
            videos: state.openedDatabase && samePath(state.openedDatabase, path) ? [] : state.videos,
          };
        });
      },

      deleteDatabase: async (name) => {
        try {
          await scoutDeleteDatabase(name, customPath());
          set((state) => {
            const nextSelected = state.selectedDatabases.filter((p) => !samePath(p, name));
            const nextExpanded = { ...state.expandedDatabases };
            delete nextExpanded[name];
            const nextVByDb = { ...state.videosByDatabase };
            delete nextVByDb[name];
            const nextExternal = state.externalPaths.filter((p) => !samePath(p, name));
            const nextUnloaded = state.unloadedPaths.filter((p) => !samePath(p, name));
            return {
              selectedDatabases: nextSelected,
              expandedDatabases: nextExpanded,
              videosByDatabase: nextVByDb,
              externalPaths: nextExternal,
              unloadedPaths: nextUnloaded,
              openedDatabase: state.openedDatabase && samePath(state.openedDatabase, name) ? null : state.openedDatabase,
              videos: state.openedDatabase && samePath(state.openedDatabase, name) ? [] : state.videos,
            };
          });
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
        const currentSelected = get().selectedDatabases;
        let nextSelected: string[] = [];
        if (mode === "toggle") {
          nextSelected = currentSelected.includes(path)
            ? currentSelected.filter((p) => p !== path)
            : [...currentSelected, path];
        } else if (mode === "range" && currentSelected.length > 0 && allPaths.length > 0) {
          const last = currentSelected[currentSelected.length - 1];
          const startIdx = allPaths.indexOf(last);
          const endIdx = allPaths.indexOf(path);
          if (startIdx >= 0 && endIdx >= 0) {
            const lo = Math.min(startIdx, endIdx);
            const hi = Math.max(startIdx, endIdx);
            const range = allPaths.slice(lo, hi + 1);
            nextSelected = Array.from(new Set([...currentSelected, ...range]));
          } else {
            nextSelected = [path];
          }
        } else {
          nextSelected = [path];
        }
        set({
          selectedDatabases: nextSelected,
          selectedVideos: [],
          openedDatabase: nextSelected.length === 1 ? nextSelected[0] : get().openedDatabase,
        });
      },

      selectVideo: (videoPath, parentDbPath, mode = "single", allVideoPaths = []) => {
        const currentSelected = get().selectedVideos;
        let nextSelected: string[] = [];
        if (mode === "toggle") {
          nextSelected = currentSelected.includes(videoPath)
            ? currentSelected.filter((p) => p !== videoPath)
            : [...currentSelected, videoPath];
        } else if (mode === "range" && currentSelected.length > 0 && allVideoPaths.length > 0) {
          const last = currentSelected[currentSelected.length - 1];
          const startIdx = allVideoPaths.indexOf(last);
          const endIdx = allVideoPaths.indexOf(videoPath);
          if (startIdx >= 0 && endIdx >= 0) {
            const lo = Math.min(startIdx, endIdx);
            const hi = Math.max(startIdx, endIdx);
            const range = allVideoPaths.slice(lo, hi + 1);
            nextSelected = Array.from(new Set([...currentSelected, ...range]));
          } else {
            nextSelected = [videoPath];
          }
        } else {
          nextSelected = [videoPath];
        }
        // episode picks narrow the search; which databases are searched stays as is
        set({
          selectedVideos: nextSelected,
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

            const nextResults = deletedFilePath
              ? state.results.filter((hit) => !samePath(hit.videoPath, deletedFilePath))
              : state.results;

            return {
              videos: nextVideos,
              videosByDatabase: nextVByDb,
              selectedVideos: nextSelectedVideos,
              databases: nextDatabases,
              results: nextResults,
            };
          });

          if (deletedFilePath) {
            const appClips = useAppStateStore.getState().clips;
            const filteredClips = appClips.filter((clip) => !samePath(clip.src, deletedFilePath));
            if (filteredClips.length !== appClips.length) {
              useAppStateStore.getState().setClips(filteredClips);
            }
          }

          await get().loadDatabases();
        } catch (err) {
          set({ error: message(err) });
        }
      },

      addVideo: async (videoPath) => {
        return get().addVideos([videoPath]);
      },

      addVideos: async (videoPaths) => {
        if (!videoPaths.length) return { ok: true, message: null };
        const database = get().openedDatabase || get().selectedDatabases[0];
        if (!database) return { ok: false, message: "Select or open a database first." };

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
              appState.setProgressMsg(`Sampling ${total} representative frames…`);
              appState.setProgress(20);
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

          const detector = useGeneralSettingsStore.getState().sceneDetectionMethod;
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

            const keepModelInMemory = get().settings.keepModelInMemory ?? true;
            const gpuStandby = get().settings.gpuStandby ?? true;
            await scoutAddVideo(database, videoPath, detector, customPath(), keepModelInMemory, gpuStandby);
            console.log(`SCOUT|queue [${i + 1}/${totalVideos}] completed ${name}`);
          }
          await Promise.all([get().loadVideos(database), get().loadDatabases()]);
          console.log(`SCOUT|queue all ${totalVideos} videos indexed successfully`);
          return { ok: true, message: null };
        } catch (err) {
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

        // an empty list makes the CLI fall back to every file in the managed folder, which is not what the panel shows
        if (get().selectedDatabases.length === 0) {
          set({ error: "Add a database to the Searching list on the left first." });
          return;
        }

        if (!(await useAiDepsStore.getState().ensurePack("scout"))) {
          set({ error: "Scene Scout needs its AI pack installed." });
          return;
        }

        set({ searching: true, error: null });
        const appState = useAppStateStore.getState();
        let stopListener: (() => void) | null = null;
        let cardOpened = false;

        try {
          stopListener = await listen<ScoutIndexProgress>("scout_progress", (e) => {
            if (e.payload.stage === "loading_model") {
              cardOpened = true;
              appState.setActiveOperation("scout_search");
              appState.setLoading(true);
              appState.setProgress(0);
              appState.setProgressMsg("Loading SigLIP 2 model weights…");
            }
          });

          const searchSettings = {
            ...get().settings,
            selectedDatabases: get().selectedDatabases,
            selectedVideos: get().selectedVideos,
          };
          const results = await scoutSearch(query, searchSettings, customPath());
          set({ results, lastQuery: query });
        } catch (err) {
          set({ results: [], error: message(err) });
        } finally {
          if (stopListener) {
            stopListener();
          }
          if (cardOpened) {
            appState.setActiveOperation(null);
            appState.setLoading(false);
            appState.setProgressMsg("");
          }
          set({ searching: false });
        }
      },

      clearResults: () => set({ results: [], lastQuery: "", query: "" }),

      updateSettings: (changes) =>
        set((state) => ({ settings: { ...state.settings, ...changes } })),

      generateThumbnails: async (path: string) => {
        try {
          const appState = useAppStateStore.getState();
          appState.setActiveOperation("scout_add");
          appState.setLoading(true);
          appState.setProgress(0);
          appState.setProgressMsg("Generating missing database thumbnails...");

          const res = await scoutGenerateThumbnails(path, customPath());
          await get().loadDatabases();
          return { ok: true, generated: res.generated, message: null };
        } catch (err) {
          return { ok: false, generated: 0, message: message(err) };
        } finally {
          const appState = useAppStateStore.getState();
          appState.setActiveOperation(null);
          appState.setLoading(false);
          appState.setProgress(0);
          appState.setProgressMsg("");
        }
      },

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
        selectedDatabases: state.selectedDatabases,
        // the only record that a database outside the managed folder exists
        externalPaths: state.externalPaths,
        unloadedPaths: state.unloadedPaths,
        displayNames: state.displayNames,
        panelSplitPct: state.panelSplitPct,
      }),
    }
  )
);
