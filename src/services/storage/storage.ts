import type { Settings } from '../../app/types';

/**
 * Persistence layer.
 *
 * localStorage keeps the small profile JSON (synchronous and simple), while
 * IndexedDB stores the large, append-only game records. The whole store is
 * mirrored to IndexedDB as well so that a quota error on localStorage never
 * silently loses a save.
 */

const KEY = 'gomaster.profile.v1';
const DB_NAME = 'gomaster';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function loadJSON<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

let writeTimer: number | null = null;
let pending: unknown = null;

/** Debounced write: the UI saves after every meaningful action. */
export function saveJSON(value: unknown) {
  pending = value;
  if (writeTimer !== null) window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    writeTimer = null;
    flushNow(pending);
  }, 220);
}

export function flushNow(value: unknown) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage full or disabled: indexdb mirror below is the fallback.
  }
  void idbSet('profile', value);
}

export async function loadMirrored<T>(fallback: T): Promise<T> {
  const fromLs = loadJSON<T | null>(null);
  if (fromLs) return fromLs;
  const fromIdb = await idbGet<T>('profile');
  return fromIdb ?? fallback;
}

/* ------------------------------------------------------------------------- */
/* Game records (IndexedDB, larger objects)                                  */
/* ------------------------------------------------------------------------- */

export async function putGame(record: unknown): Promise<void> {
  const db = await openDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record, `game:${(record as { id: string }).id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getGames<T>(): Promise<T[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const all = (req.result as unknown[]).filter(
          (v) => v && typeof v === 'object' && 'id' in (v as object) && 'moves' in (v as object),
        );
        resolve(all as T[]);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function deleteGame(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(`game:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAll(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  const db = await openDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  coordinates: false,
  komi: 6.5,
  ruleset: 'chinese',
  showHints: true,
};
