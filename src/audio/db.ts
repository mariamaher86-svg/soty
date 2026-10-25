// The app's IndexedDB database: "teacher" (teacher recordings) and "songFiles" (song library audio).
// Version 2 adds "songFiles"; existing data in "teacher" is kept.

const DB = 'soty';
const VERSION = 2;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('teacher')) db.createObjectStore('teacher', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('songFiles')) db.createObjectStore('songFiles', { keyPath: 'songId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * One request in its own transaction. Writes resolve only when the transaction completes, so a full
 * disk (QuotaExceededError, reported when the transaction aborts) is a rejection, not a silent loss.
 */
export function run<T>(store: 'teacher' | 'songFiles', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        let result: T;
        req.onsuccess = () => {
          result = req.result as T;
          if (mode === 'readonly') resolve(result);
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error ?? req.error);
      }),
  );
}

export function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
}
