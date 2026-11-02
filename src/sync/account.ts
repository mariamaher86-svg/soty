// "حسابي": optional email + password sign-in to her own Supabase project, and keeping this device in sync with it.
// Without the config (src/config/supabase.ts) or without signing in, nothing here runs and the app is device-only.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabaseKey, supabaseUrl } from '../config/supabase';
import {
  changeNeedsSync,
  checkReachable,
  createScheduler,
  FILE_STATE_KEY,
  readConfig,
  songFilePath,
  songKeyOfPath,
  syncDocs,
  planFiles,
  teacherPath,
  type LocalDocs,
  type Reach,
  type RemoteFile,
  type SyncBackend,
  type SyncSummary,
} from '../lib/sync';
import { BLOCKED_MSG, forgotFlow, newPasswordFlow, OFFLINE_MSG, parseAuthHash, signInFlow, signInProblem, signUpFlow, signUpProblem, validEmail, type AuthBackend, type AuthResult } from '../lib/auth';
import { DIRTY_KEY, getPref, getSongs, LOCAL_CHANGE_EVENT, readAppStorage, setPref } from '../lib/storage';
import { base64ToFloat, floatToBase64, type TeacherBackup } from '../lib/backup';
import { songIdOfKey } from '../lib/choir';
import { lifecycle } from '../lib/lifecycle';
import { listTeacher, saveTeacher } from '../audio/teacherStore';
import { listSongFiles, saveSongFile } from '../audio/songFiles';
import { supabaseBackend } from './supabaseBackend';

export const syncConfig = readConfig(supabaseUrl, supabaseKey);
export const SYNC_APPLIED_EVENT = 'soty-sync-applied';
const META_KEY = 'sotysync.meta';

export interface AccountState {
  configured: boolean;
  user: { id: string; email: string } | null;
  phase: 'idle' | 'syncing' | 'error';
  reach: Reach | null;
  message: string;
  lastSync: number | null;
  summary: SyncSummary | null;
  /** bytes of her files on the server (of the free 1 GB) */
  filesBytes: number | null;
  files: { done: number; total: number } | null;
}

let state: AccountState = {
  configured: !!syncConfig,
  user: null,
  phase: 'idle',
  reach: null,
  message: '',
  lastSync: Number(getPref('sync.last')) || null,
  summary: null,
  filesBytes: null,
  files: null,
};
const subs = new Set<() => void>();
const set = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

export function useAccount(): AccountState {
  const [s, setS] = useState(state);
  useEffect(() => {
    const f = () => setS(state);
    subs.add(f);
    f();
    return () => void subs.delete(f);
  }, []);
  return s;
}

// ---- the Supabase client (loaded only when sync is set up)

let clientP: Promise<SupabaseClient> | null = null;
function client(): Promise<SupabaseClient> {
  if (!syncConfig) return Promise.reject(new Error('not configured'));
  clientP ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const sb = createClient(syncConfig.url, syncConfig.key, {
      // implicit flow: the recovery link opens in Safari, while a PKCE verifier would sit in the home-screen app's storage.
      // The URL is read only on the recovery landing, so normal "#/…" routes are never touched.
      auth: { persistSession: true, autoRefreshToken: true, flowType: 'implicit', detectSessionInUrl: parseAuthHash(window.location.hash)?.kind === 'recovery', storageKey: 'sotysync.auth' },
    });
    sb.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      set({ user: u ? { id: u.id, email: u.email ?? '' } : null });
    });
    return sb;
  });
  return clientP;
}

async function reachable(): Promise<Reach> {
  const r = await checkReachable(syncConfig!.url, syncConfig!.key, fetch, navigator.onLine);
  set({ reach: r });
  return r;
}

const REACH_MSG: Record<Exclude<Reach, 'ok'>, string> = { offline: OFFLINE_MSG, blocked: BLOCKED_MSG };

// ---- sign in / out

async function auth(): Promise<AuthBackend> {
  return (await client()).auth as unknown as AuthBackend;
}

/** Runs an auth call only if the server is reachable, so a blocked network says so instead of hanging. */
async function whenReachable<T>(f: () => Promise<T>): Promise<T | string> {
  const r = await reachable();
  return r === 'ok' ? f() : REACH_MSG[r];
}

function signedIn(result: AuthResult): string | null {
  if (!result.user) return result.error;
  set({ user: { id: result.user.id, email: result.user.email ?? '' } });
  localStorage.removeItem(META_KEY); // a fresh merge with what's on the server
  void syncNow();
  return null;
}

/** "إنشاء حساب": with "Confirm email" off she's signed in right away. */
export async function createAccount(email: string, password: string, confirm: string): Promise<string | null> {
  const problem = signUpProblem(email, password, confirm);
  if (problem) return problem;
  const r = await whenReachable(async () => signUpFlow(await auth(), email, password, confirm));
  return typeof r === 'string' ? r : signedIn(r);
}

/** "دخول": stays signed in on this device; the first sync merges both sides. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const problem = signInProblem(email, password);
  if (problem) return problem;
  const r = await whenReachable(async () => signInFlow(await auth(), email, password));
  return typeof r === 'string' ? r : signedIn(r);
}

/** "نسيتي الباسورد؟": Supabase emails a link that opens RecoveryPage. */
export async function forgotPassword(email: string): Promise<string | null> {
  if (!validEmail(email)) return forgotFlow({} as AuthBackend, email);
  return whenReachable(async () => forgotFlow(await auth(), email));
}

/** On the recovery screen: did supabase-js accept the link's tokens? (false = expired, used, or not set up) */
export async function recoveryReady(): Promise<boolean> {
  try {
    const { data } = await (await client()).auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

/** Save the new password, then leave this browser signed out: she signs in from the app's own icon. */
export async function saveNewPassword(password: string, confirm: string): Promise<string | null> {
  const e = await newPasswordFlow(await auth(), password, confirm);
  if (!e) await (await client()).auth.signOut({ scope: 'local' }).catch(() => {});
  return e;
}

export async function signOut() {
  const sb = await client();
  await sb.auth.signOut();
  localStorage.removeItem(META_KEY);
  set({ user: null, summary: null, filesBytes: null, message: '' });
}

/** "امسحي بياناتي من السيرفر": rows and files on the server go; this device keeps everything. */
export async function deleteServerData(): Promise<string | null> {
  try {
    const b = await backend();
    await b.deleteAll();
    localStorage.removeItem(META_KEY);
    set({ filesBytes: 0, message: 'اتمسحت بياناتك من السيرفر. اللي على الجهاز ده زي ما هو.' });
    return null;
  } catch (e) {
    return 'معرفناش نمسح: ' + String((e as Error).message ?? e);
  }
}

async function backend(): Promise<SyncBackend> {
  const sb = await client();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error('not signed in');
  return supabaseBackend(sb, data.user.id);
}

// ---- this device as the local side of the sync

const localDocs: LocalDocs = {
  read: readAppStorage,
  // written straight to localStorage (not via storage.ts) so what came from the server isn't marked as a change here
  write: (s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  },
  getMeta: () => JSON.parse(localStorage.getItem(META_KEY) ?? '{}'),
  setMeta: (m) => localStorage.setItem(META_KEY, JSON.stringify(m)),
  getDirty: () => JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '{}'),
  clearDirty: (upTo) => {
    const d = JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '{}') as Record<string, number>;
    for (const [k, t] of Object.entries(d)) if (t <= upTo) delete d[k];
    localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
  },
};

/** Audio files: teacher / "دو ري مي" recordings (as the backup's JSON) and song files (as they are). */
async function syncFiles(b: SyncBackend) {
  const teacher = await listTeacher();
  const songFiles = await listSongFiles();
  const local: RemoteFile[] = [
    ...teacher.map((t) => ({ path: teacherPath(t.createdAt), size: t.data.length * 2 })),
    ...songFiles.map((f) => ({ path: songFilePath(f.songId, f.name), size: f.bytes.byteLength })),
  ];
  const remote = await b.listFiles();
  const plan = planFiles(local, remote, readAppStorage()[FILE_STATE_KEY]);
  const songIds = new Set(getSongs().map((s) => s.id));
  const download = plan.download.filter((p) => !p.startsWith('songs/') || songIds.has(songIdOfKey(songKeyOfPath(p) ?? '')));
  const total = plan.upload.length + download.length;
  let done = 0;
  const step = () => set({ files: total ? { done: ++done, total } : null });
  if (total) set({ files: { done: 0, total } });
  const failed: string[] = [];
  const retry = async (f: () => Promise<void>, path: string) => {
    for (let i = 0; i < 3; i++) {
      try {
        return await f();
      } catch {
        if (i === 2) failed.push(path);
      }
    }
  };
  for (const path of plan.upload) {
    await retry(async () => {
      if (path.startsWith('teacher/')) {
        const t = teacher.find((x) => teacherPath(x.createdAt) === path)!;
        const json: TeacherBackup = { freq: t.freq, sampleRate: t.sampleRate, createdAt: t.createdAt, audio: floatToBase64(t.data), ...(t.target !== undefined ? { target: t.target } : {}), ...(t.syllable ? { syllable: t.syllable } : {}) };
        await b.upload(path, new TextEncoder().encode(JSON.stringify(json)), 'application/json');
      } else {
        const f = songFiles.find((x) => songFilePath(x.songId, x.name) === path)!;
        await b.upload(path, new Uint8Array(f.bytes), f.type || 'audio/mpeg');
      }
    }, path);
    step();
  }
  for (const path of download) {
    await retry(async () => {
      const { bytes, contentType } = await b.download(path);
      if (path.startsWith('teacher/')) {
        const t = JSON.parse(new TextDecoder().decode(bytes)) as TeacherBackup;
        await saveTeacher({ freq: t.freq, sampleRate: t.sampleRate, createdAt: t.createdAt, data: base64ToFloat(t.audio), target: t.target, syllable: t.syllable });
      } else {
        const key = songKeyOfPath(path)!;
        const name = decodeURIComponent(path.split('/')[2] ?? 'audio');
        const r = await saveSongFile({ songId: key, name, type: contentType, bytes: bytes.slice().buffer });
        if (!r.ok) throw new Error(r.error);
      }
    }, path);
    step();
  }
  await b.removeFiles(plan.remove);
  set({ files: null, filesBytes: (await b.listFiles()).reduce((a, f) => a + f.size, 0) });
  if (failed.length) throw new Error(`${failed.length} ملف متزامنوش — هنجرب تاني بعدين`);
}

/** One full sync: data, then (if allowed) audio files. Throws on failure so the scheduler retries. */
async function runSync() {
  if (!syncConfig || !state.user) return;
  const r = await reachable();
  if (r !== 'ok') {
    set({ phase: 'error', message: REACH_MSG[r] });
    throw new Error(r);
  }
  set({ phase: 'syncing', message: '' });
  try {
    const b = await backend();
    const before = readAppStorage();
    const summary = await syncDocs(b, localDocs);
    const after = readAppStorage();
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
    if (changed.length) window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: changed }));
    if (getPref('sync.audio') !== '0') await syncFiles(b);
    const now = Date.now();
    setPref('sync.last', String(now));
    set({ phase: 'idle', lastSync: now, summary, message: '' });
  } catch (e) {
    set({ phase: 'error', files: null, message: 'المزامنة موقفة دلوقتي — هنجرب تاني لوحدنا. (' + String((e as Error).message ?? e) + ')' });
    throw e;
  }
}

const scheduler = createScheduler(runSync);

/** "زامني دلوقتي" */
export function syncNow(): Promise<void> {
  return scheduler.now();
}

/** Once at startup: restore the saved session, then sync on start, on return to the app, when back online, after changes. */
export function installSync() {
  if (!syncConfig) return;
  void client()
    .then((sb) => sb.auth.getSession())
    .then(({ data }) => {
      const u = data.session?.user;
      if (!u) return;
      set({ user: { id: u.id, email: u.email ?? '' } });
      scheduler.request();
    })
    .catch(() => {});
  lifecycle.onVisible(() => state.user && scheduler.request());
  window.addEventListener('online', () => state.user && scheduler.online());
  window.addEventListener(LOCAL_CHANGE_EVENT, (e) => {
    if (state.user && changeNeedsSync((e as CustomEvent<string[]>).detail ?? [])) scheduler.request();
  });
}
