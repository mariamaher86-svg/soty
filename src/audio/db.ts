// The app's IndexedDB database: "teacher" (teacher recordings), "songFiles" (song library audio), "curves" (analysed songs).
// Version 2 adds "songFiles", version 3 "curves"; existing data is kept.

const DB = 'soty';
const VERSION = 3;

type StoreName = 'teacher' | 'songFiles' | 'curves';

// one connection for the whole app (a connection per request piles up); iOS can drop it in the background
let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  connection ??= openConnection().catch((e) => {
    connection = null;
    throw e;
  });
  return connection;
}

function openConnection(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('teacher')) db.createObjectStore('teacher', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('songFiles')) db.createObjectStore('songFiles', { keyPath: 'songId' });
      if (!db.objectStoreNames.contains('curves')) db.createObjectStore('curves', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => (connection = null);
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * One request in its own transaction. Writes resolve only when the transaction completes, so a full
 * disk (QuotaExceededError, reported when the transaction aborts) is a rejection, not a silent loss.
 */
export function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(store, mode);
        } catch (e) {
          connection = null; // the connection died: the next request opens a new one
          return reject(e);
        }
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
