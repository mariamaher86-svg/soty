// "حسابي": optional email-code sign-in to her own Supabase project, and keeping this device in sync with it.
// Without the config (src/config/supabase.ts) or without signing in, nothing here runs and the app is device-only.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabaseKey, supabaseUrl } from '../config/supabase';
import {
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
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'sotysync.auth' },
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

const REACH_MSG: Record<Exclude<Reach, 'ok'>, string> = {
  offline: 'مفيش إنترنت دلوقتي — هنزامن أول ما النت يرجع. التطبيق شغال عادي.',
  blocked: 'السيرفر مش بيرد من الشبكة دي (ممكن تكون قافلاه) — جربي واي فاي تاني أو بيانات الموبايل. التطبيق شغال عادي.',
};

function authError(e: { message?: string; status?: number; code?: string } | null): string {
  const m = (e?.message ?? '').toLowerCase();
  if (e?.status === 429 || m.includes('rate')) return 'اتبعت إيميلات كتير الساعة دي — استني شوية وجربي تاني.';
  if (m.includes('expired') || m.includes('invalid') || m.includes('token')) return 'الكود غلط أو وقته خلص — اطلبي كود جديد.';
  if (m.includes('fetch') || m.includes('network')) return REACH_MSG.blocked;
  return 'حصلت مشكلة: ' + (e?.message ?? '');
}

// ---- sign in / out

/** Step 1: email a 6-digit code (an account is created the first time). */
export async function sendCode(email: string): Promise<string | null> {
  if ((await reachable()) !== 'ok') return REACH_MSG[state.reach as 'offline' | 'blocked'];
  const sb = await client();
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? authError(error) : null;
}

/** Step 2: the code from the email. Signed in for good on this device; then the first sync merges both sides. */
export async function verifyCode(email: string, code: string): Promise<string | null> {
  const sb = await client();
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
  if (error || !data.user) return authError(error);
  set({ user: { id: data.user.id, email: data.user.email ?? email } });
  localStorage.removeItem(META_KEY); // a fresh merge with what's on the server
  await syncNow();
  return null;
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
  window.addEventListener(LOCAL_CHANGE_EVENT, () => state.user && scheduler.request());
}
