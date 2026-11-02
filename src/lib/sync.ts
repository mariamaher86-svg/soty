// Sync with her own Supabase project — pure logic, no network (tested with a fake backend).
// The format is the backup's: one document per app localStorage key ("soty.v1" = results/range/path, "soty.songs" =
// library, "soty.pref.*" = settings). Results and songs merge exactly like a backup "merge"; other keys: newest wins.
// The device stays the working store; sync only reconciles. Nothing is ever wiped on either side.

import { APP_KEY_PREFIX, mergeData } from './backup';
import { mergeSongs, type Song } from './songs';

const DATA_KEY = 'soty.v1';
const SONGS_KEY = 'soty.songs';
/** files deleted on purpose (so they don't come back from the server): path → { deleted, at } */
export const FILE_STATE_KEY = 'soty.pref.sync.files.state';

/** Settings that belong to one device (its mic, its delay, its own choices about data use). */
export const DEVICE_ONLY = new Set(['soty.pref.noise.rms', 'soty.pref.rhythm.latency', 'soty.pref.tips.hidden', 'soty.pref.sync.audio', 'soty.pref.sync.last']);

export const syncableKey = (k: string) => k.startsWith(APP_KEY_PREFIX) && !DEVICE_ONLY.has(k);

export interface RemoteDoc {
  key: string;
  value: string;
  /** server time (ISO) of the last write */
  updated_at: string;
}

/** What both sides looked like at the last successful sync, per key. */
export type SyncMeta = Record<string, { hash: string; at: string }>;
/** When each key was last changed on this device (ms). */
export type Dirty = Record<string, number>;

export interface SyncSummary {
  pulled: number;
  pushed: number;
  merged: number;
  /** results that came from the server */
  newResults: number;
  newSongs: number;
}

export interface DocPlan {
  setLocal: Record<string, string>;
  push: { key: string; value: string }[];
  summary: SyncSummary;
}

/** Short, stable fingerprint of a value (FNV-1a). */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36) + ':' + s.length.toString(36);
}

const parse = <T,>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

type FileState = Record<string, { deleted: boolean; at: number }>;

/** Two copies of a mergeable key combined (no duplicates); null = not a mergeable key. */
export function mergeDoc(key: string, a: string, b: string): string | null {
  if (key === DATA_KEY) return JSON.stringify(mergeData(parse(a, { results: [] }), parse(b, { results: [] })));
  if (key === SONGS_KEY) return JSON.stringify(mergeSongs(parse<Song[]>(a, []), parse<Song[]>(b, [])));
  if (key === FILE_STATE_KEY) {
    const out: FileState = { ...parse<FileState>(a, {}) };
    for (const [p, s] of Object.entries(parse<FileState>(b, {}))) if (!out[p] || s.at > out[p].at) out[p] = s;
    return JSON.stringify(out);
  }
  return null;
}

const resultCount = (raw: string | undefined) => (raw ? (parse<{ results?: unknown[] }>(raw, {}).results?.length ?? 0) : 0);
const songCount = (raw: string | undefined) => (raw ? parse<unknown[]>(raw, []).length : 0);

/**
 * Decide, key by key: take the server's copy, send ours, or merge.
 * - only one side has it → copy it over;
 * - only one side changed since the last sync → that side wins (so clearing results here really clears them);
 * - both changed (or first sync on a device that already has data) → merge results/songs, otherwise newest wins.
 */
export function planDocs(local: Record<string, string>, remote: RemoteDoc[], meta: SyncMeta, dirty: Dirty): DocPlan {
  const rem = new Map(remote.filter((r) => syncableKey(r.key)).map((r) => [r.key, r]));
  const keys = new Set([...Object.keys(local).filter(syncableKey), ...rem.keys()]);
  const setLocal: Record<string, string> = {};
  const push: { key: string; value: string }[] = [];
  const summary: SyncSummary = { pulled: 0, pushed: 0, merged: 0, newResults: 0, newSongs: 0 };
  const take = (key: string, value: string) => {
    setLocal[key] = value;
    summary.pulled++;
  };
  const send = (key: string, value: string) => {
    push.push({ key, value });
    summary.pushed++;
  };
  for (const key of keys) {
    const L = local[key];
    const R = rem.get(key);
    const M = meta[key];
    if (L === undefined && R) take(key, R.value);
    else if (L !== undefined && !R) send(key, L);
    else if (L !== undefined && R) {
      if (L === R.value) continue;
      const localChanged = !M || hashString(L) !== M.hash;
      const remoteChanged = !M || R.updated_at !== M.at;
      if (localChanged && !remoteChanged) send(key, L);
      else if (!localChanged && remoteChanged) take(key, R.value);
      else if (localChanged && remoteChanged) {
        const m = mergeDoc(key, L, R.value);
        if (m !== null) {
          summary.merged++;
          if (m !== L) setLocal[key] = m;
          if (m !== R.value) push.push({ key, value: m });
        } else if ((dirty[key] ?? 0) > Date.parse(R.updated_at)) send(key, L);
        else take(key, R.value);
      }
    }
  }
  summary.newResults = Math.max(0, resultCount(setLocal[DATA_KEY] ?? local[DATA_KEY]) - resultCount(local[DATA_KEY]));
  summary.newSongs = Math.max(0, songCount(setLocal[SONGS_KEY] ?? local[SONGS_KEY]) - songCount(local[SONGS_KEY]));
  return { setLocal, push, summary };
}

/** The new "last synced" state after a plan was applied and the pushes were accepted (with server times). */
export function nextMeta(local: Record<string, string>, remote: RemoteDoc[], plan: DocPlan, pushed: RemoteDoc[]): SyncMeta {
  const meta: SyncMeta = {};
  const at = new Map(remote.map((r) => [r.key, r.updated_at]));
  for (const p of pushed) at.set(p.key, p.updated_at);
  const finalLocal = { ...local, ...plan.setLocal };
  for (const [key, value] of Object.entries(finalLocal)) {
    if (!syncableKey(key) || !at.has(key)) continue;
    meta[key] = { hash: hashString(value), at: at.get(key)! };
  }
  return meta;
}

// ---- the backend and the device, as small interfaces (Supabase in the app, in-memory in tests)

export interface RemoteFile {
  /** path inside her folder, e.g. "teacher/1730000000000.json" */
  path: string;
  size: number;
}

export interface SyncBackend {
  getDocs(): Promise<RemoteDoc[]>;
  /** upsert; returns the rows with their new server time */
  putDocs(docs: { key: string; value: string }[]): Promise<RemoteDoc[]>;
  deleteAll(): Promise<void>;
  listFiles(): Promise<RemoteFile[]>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  removeFiles(paths: string[]): Promise<void>;
}

export interface LocalDocs {
  read(): Record<string, string>;
  write(set: Record<string, string>): void;
  getMeta(): SyncMeta;
  setMeta(m: SyncMeta): void;
  getDirty(): Dirty;
  /** forget local edit marks made up to this time (synced now) */
  clearDirty(upTo: number): void;
}

/** One document round: read both sides, plan, write here, send there, remember. Throws if the network fails (retried later). */
export async function syncDocs(backend: SyncBackend, store: LocalDocs, now = Date.now()): Promise<SyncSummary> {
  const remote = await backend.getDocs();
  const local = store.read();
  const plan = planDocs(local, remote, store.getMeta(), store.getDirty());
  const pushed = plan.push.length ? await backend.putDocs(plan.push) : [];
  if (Object.keys(plan.setLocal).length) store.write(plan.setLocal);
  store.setMeta(nextMeta(local, remote, plan, pushed));
  store.clearDirty(now);
  return plan.summary;
}

// ---- files

export const teacherPath = (createdAt: number) => `teacher/${createdAt}.json`;
export const songFilePath = (key: string, name: string) => `songs/${encodeURIComponent(key)}/${encodeURIComponent(name || 'audio')}`;
/** the song-file key ("songId" or "songId::partId") a stored path belongs to */
export const songKeyOfPath = (path: string) => (path.startsWith('songs/') ? decodeURIComponent(path.split('/')[1] ?? '') : null);
/** her private folder in the bucket: every path starts with her user id (that's what the storage policy checks) */
export const storagePath = (userId: string, path: string) => `${userId}/${path}`;

/**
 * Which files to send, fetch and delete. Files deleted on purpose are neither sent nor fetched; deletions reach the
 * server. A song has one file per key: a new file here replaces the server's copy (even with another name), and the
 * server's copy is only fetched when this device has no file for that song at all.
 */
export function planFiles(local: RemoteFile[], remote: RemoteFile[], stateRaw: string | undefined): { upload: string[]; download: string[]; remove: string[] } {
  const state = stateRaw ? parse<FileState>(stateRaw, {}) : {};
  const folder = (p: string) => `songs/${p.split('/')[1]}`;
  const deleted = (p: string) => state[p]?.deleted === true || (p.startsWith('songs/') && state[folder(p)]?.deleted === true);
  const l = new Set(local.map((f) => f.path));
  const r = new Set(remote.map((f) => f.path));
  const localSongs = new Set(local.filter((f) => f.path.startsWith('songs/')).map((f) => folder(f.path)));
  const upload = [...l].filter((p) => !r.has(p) && !deleted(p));
  const replaced = new Set(upload.filter((p) => p.startsWith('songs/')).map(folder));
  return {
    upload,
    download: [...r].filter((p) => !l.has(p) && !deleted(p) && !(p.startsWith('songs/') && localSongs.has(folder(p)))),
    remove: [...r].filter((p) => deleted(p) || (p.startsWith('songs/') && replaced.has(folder(p)) && !l.has(p))),
  };
}

/** Is this path (or its song folder) marked deleted? */
export function isMarkedDeleted(stateRaw: string | null, path: string): boolean {
  const s = stateRaw ? parse<FileState>(stateRaw, {}) : {};
  return s[path]?.deleted === true;
}

/** Mark a file as deleted (or back again) in the shared file state. */
export function setFileState(stateRaw: string | null, path: string, deleted: boolean, at = Date.now()): string {
  const s = stateRaw ? parse<FileState>(stateRaw, {}) : {};
  s[path] = { deleted, at };
  return JSON.stringify(s);
}

export const FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

// ---- sign-in input

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** The 6-digit code from the email, typed with Arabic or Latin digits and maybe spaces; null if it isn't 6 digits. */
export function normalizeOtp(input: string): string | null {
  const latin = input.replace(/[٠-٩۰-۹]/g, (d) => String(AR_DIGITS.indexOf(d) >= 0 ? AR_DIGITS.indexOf(d) : FA_DIGITS.indexOf(d))).replace(/[\s-]/g, '');
  return /^\d{6}$/.test(latin) ? latin : null;
}

export function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

// ---- retrying when offline / the network fails

export interface Scheduler {
  /** ask for a sync soon (several requests in a row become one) */
  request(): void;
  /** run now, ignoring the debounce */
  now(): Promise<void>;
  /** the network is back: try again right away if something is waiting */
  online(): void;
  pending(): boolean;
}

/** Debounced sync with retries after failures (30 s, 2 min, 10 min, then every 10 min). Changes made meanwhile wait. */
export function createScheduler(run: () => Promise<void>, opts: { debounceMs?: number; retryMs?: number[]; setTimer?: (f: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void } = {}): Scheduler {
  const debounce = opts.debounceMs ?? 3000;
  const retries = opts.retryMs ?? [30000, 120000, 600000];
  const setT = opts.setTimer ?? ((f, ms) => setTimeout(f, ms));
  const clearT = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let failures = 0;
  let dirty = false;
  let running = false;
  const schedule = (ms: number) => {
    if (timer !== null) clearT(timer);
    timer = setT(() => {
      timer = null;
      void go();
    }, ms);
  };
  const go = async () => {
    if (running) {
      dirty = true; // a change during a sync: sync again after it
      return;
    }
    running = true;
    dirty = false;
    let ok = false;
    try {
      await run();
      ok = true;
      failures = 0;
    } catch {
      failures++;
      dirty = true;
      schedule(retries[Math.min(failures - 1, retries.length - 1)]);
    } finally {
      running = false;
    }
    if (ok && dirty) schedule(debounce);
  };
  return {
    request: () => {
      dirty = true;
      if (!running && failures === 0) schedule(debounce);
    },
    now: () => {
      if (timer !== null) clearT(timer);
      timer = null;
      return go();
    },
    online: () => {
      if (!dirty) return;
      failures = 0;
      schedule(0);
    },
    pending: () => dirty,
  };
}

// ---- config and network

/** URL + public key, or null when sync isn't set up (then the account page says so and nothing else changes). */
export function readConfig(url: string | undefined, key: string | undefined): { url: string; key: string } | null {
  const u = (url ?? '').trim().replace(/\/+$/, '');
  const k = (key ?? '').trim();
  if (!/^https:\/\/[^\s/]+$/.test(u) || k.length < 20) return null;
  return { url: u, key: k };
}

export type Reach = 'ok' | 'blocked' | 'offline';

/** Can this network reach her Supabase project? (Some networks block hosts, like netlify.app was.) Never hangs. */
export async function checkReachable(url: string, key: string, fetchImpl: typeof fetch, online: boolean, timeoutMs = 6000): Promise<Reach> {
  if (!online) return 'offline';
  try {
    const res = await Promise.race([
      fetchImpl(`${url}/auth/v1/health`, { headers: { apikey: key } }),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    return res && res.status < 500 ? 'ok' : 'blocked';
  } catch {
    return 'blocked';
  }
}
