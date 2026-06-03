import type { StateStorage } from "zustand/middleware";

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
    // Return unmodified payload if legacy normalization fails.
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

    // Migrate legacy localStorage payload lazily on first read.
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
