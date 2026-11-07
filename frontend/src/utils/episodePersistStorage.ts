import type { PersistStorage, StateStorage, StorageValue } from "zustand/middleware";

// the episode list lives in IndexedDB (same names and payload as V1): localStorage caps at ~5 MB, which a big library outgrows
const DB_NAME = "amverge_persist_v1";
const STORE_NAME = "zustand";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });

  return dbPromise;
}

function normalizeLegacyPayload(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && !parsed.state && Array.isArray(parsed.episodes)) {
      return JSON.stringify({
        state: { episodes: parsed.episodes },
        version: 0,
      });
    }
  } catch {
    // return the payload unmodified if legacy normalization fails
  }

  return raw;
}

async function readFromDb(name: string): Promise<string | null> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(name);

    request.onsuccess = () => {
      const value = request.result;
      resolve(typeof value === "string" ? value : null);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to read persist value"));
  });
}

async function writeToDb(name: string, value: string): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to write persist value"));

    const store = tx.objectStore(STORE_NAME);
    store.put(value, name);
  });
}

async function removeFromDb(name: string): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to remove persist value"));

    const store = tx.objectStore(STORE_NAME);
    store.delete(name);
  });
}

export const episodePersistStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const fromDb = await readFromDb(name);
      if (fromDb !== null) {
        return fromDb;
      }
    } catch (error) {
      console.warn("[episodePersistStorage] IndexedDB read failed, falling back to localStorage.", error);
    }

    const legacy = localStorage.getItem(name);
    if (!legacy) return null;

    const normalized = normalizeLegacyPayload(legacy);

    // an episode list from before this lived in localStorage; it moves over on first read
    try {
      await writeToDb(name, normalized);
    } catch (error) {
      console.warn("[episodePersistStorage] IndexedDB migration write failed, keeping localStorage payload.", error);
    }

    return normalized;
  },

  setItem: async (name, value) => {
    try {
      await writeToDb(name, value);
      localStorage.removeItem(name);
      return;
    } catch (error) {
      console.warn("[episodePersistStorage] IndexedDB write failed, falling back to localStorage.", error);
    }

    localStorage.setItem(name, value);
  },

  removeItem: async (name) => {
    try {
      await removeFromDb(name);
    } catch (error) {
      console.warn("[episodePersistStorage] IndexedDB delete failed, continuing localStorage cleanup.", error);
    }
    localStorage.removeItem(name);
  },
};

// a burst (an import patches the list every frame) waits this long after a write before the next
const BURST_GAP_MS = 300;

// split layout: the list key holds only the ordered ids, each episode sits under its own key
const SPLIT_LAYOUT = 2;
const episodeKey = (name: string, id: string) => `${name}:ep:${id}`;
const episodeKeyRange = (name: string) => IDBKeyRange.bound(`${name}:ep:`, `${name}:ep:￿`);

type SplitIndex = { layout: typeof SPLIT_LAYOUT; ids: string[]; version?: number };
type StoredEpisode = { id: string };

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function readEpisodes(name: string, ids: string[]): Promise<StoredEpisode[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const values: (string | undefined)[] = new Array(ids.length);
  ids.forEach((id, i) => {
    const request = store.get(episodeKey(name, id));
    request.onsuccess = () => (values[i] = typeof request.result === "string" ? request.result : undefined);
  });
  await txDone(tx);
  return values.flatMap((raw) => (raw ? [JSON.parse(raw) as StoredEpisode] : []));
}

// one transaction: the changed episodes, the removed ones, and the id list land together or not at all
async function writeSplit(
  name: string,
  index: SplitIndex,
  changed: StoredEpisode[],
  removedIds: string[]
): Promise<void> {
  const serialized = changed.map((ep) => [episodeKey(name, ep.id), JSON.stringify(ep)] as const);
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const [key, value] of serialized) store.put(value, key);
  for (const id of removedIds) store.delete(episodeKey(name, id));
  store.put(JSON.stringify(index), name);
  await txDone(tx);
  localStorage.removeItem(name);
}

/**
 * the episode list saved one episode per key, only the episodes that changed, one write at a time: a single
 * blob meant every update (even selecting an episode) stringified the whole library, and an import rewrote it every frame
 */
export function coalescedPersistStorage<S extends { episodes: StoredEpisode[] }>(): PersistStorage<S> {
  // what is on disk, by reference: an unchanged episode keeps its object, so it is skipped
  let lastList: unknown = undefined;
  let written = new Map<string, StoredEpisode>();
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let writing = false;
  let cooldown: number | null = null;

  const write = async (name: string, value: StorageValue<S>) => {
    const episodes = value.state.episodes;
    const changed = episodes.filter((ep) => written.get(ep.id) !== ep);
    const keep = new Set(episodes.map((ep) => ep.id));
    const removedIds = [...written.keys()].filter((id) => !keep.has(id));
    try {
      await writeSplit(name, { layout: SPLIT_LAYOUT, ids: episodes.map((ep) => ep.id), version: value.version }, changed, removedIds);
      written = new Map(episodes.map((ep) => [ep.id, ep]));
    } catch (error) {
      // no IndexedDB: the old whole-list save, which falls back to localStorage
      console.warn("[episodePersistStorage] split write failed, saving the whole list.", error);
      written = new Map();
      await episodePersistStorage.setItem(name, JSON.stringify(value));
    }
  };

  const flush = async () => {
    if (writing || !pending) return;
    writing = true;
    const { name, value } = pending;
    pending = null;
    lastList = value.state.episodes;
    try {
      await write(name, value);
    } finally {
      writing = false;
      // changes during the gap wait and go out together as the newest state
      cooldown = window.setTimeout(() => {
        cooldown = null;
        void flush();
      }, BURST_GAP_MS);
    }
  };

  return {
    getItem: async (name) => {
      const raw = await episodePersistStorage.getItem(name);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.layout === SPLIT_LAYOUT) {
        const index = parsed as SplitIndex;
        const episodes = await readEpisodes(name, index.ids);
        written = new Map(episodes.map((ep) => [ep.id, ep]));
        lastList = episodes;
        return { state: { episodes } as S, version: index.version };
      }
      // a whole-list save (older builds, V1): written out split on the next save, since nothing is recorded yet
      const legacy = parsed as StorageValue<S>;
      lastList = undefined;
      written = new Map();
      return legacy;
    },
    setItem: (name, value) => {
      if (value.state.episodes === lastList && !pending) return;
      pending = { name, value };
      if (cooldown === null) void flush();
    },
    removeItem: async (name) => {
      pending = null;
      lastList = undefined;
      written = new Map();
      await removeSplit(name);
    },
  };
}

/** deletes the list key and every per-episode key */
export async function removeSplit(name: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(episodeKeyRange(name));
    await txDone(tx);
  } catch (error) {
    console.warn("[episodePersistStorage] per-episode delete failed.", error);
  }
  await episodePersistStorage.removeItem(name);
}
