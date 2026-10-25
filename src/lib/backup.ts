// Backup file: everything the app keeps on this device, in one JSON file (export / import between devices).

import type { Result, SavedRange, PathData } from './storage';
import type { Measurement, WorkoutLog } from './path';
import { mergeSongs, type Song } from './songs';

export const BACKUP_APP = 'soty';
/** 2 = adds the song library's audio files (version 1 files are still accepted). */
export const BACKUP_VERSION = 2;
/** localStorage keys that belong to the app. */
export const APP_KEY_PREFIX = 'soty.';
const DATA_KEY = 'soty.v1';
const SONGS_KEY = 'soty.songs';

export interface TeacherBackup {
  freq: number;
  sampleRate: number;
  createdAt: number;
  /** mono 16-bit PCM, little-endian, base64 */
  audio: string;
  target?: number;
  syllable?: string;
}

export interface SongFileBackup {
  songId: string;
  name: string;
  type: string;
  /** the file's bytes, base64 */
  data: string;
}

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  createdAt: string; // ISO time
  /** raw localStorage values of the app's keys */
  storage: Record<string, string>;
  teacher: TeacherBackup[];
  /** song library audio files; missing in a "without audio files" backup */
  songFiles?: SongFileBackup[];
}

// ---- audio <-> base64 (16-bit is plenty for a reference voice and halves the file size)

export function floatToBase64(data: Float32Array): string {
  const bytes = new Uint8Array(data.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(i * 2, Math.round(v * 32767), true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToFloat(b64: string): Float32Array {
  const bin = atob(b64);
  const view = new DataView(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) view.setUint8(i, bin.charCodeAt(i));
  const out = new Float32Array(Math.floor(bin.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32767;
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- build

export function buildBackup(
  storage: Record<string, string>,
  teacher: { freq: number; sampleRate: number; createdAt: number; data: Float32Array; target?: number; syllable?: string }[],
  now = new Date(),
  songFiles?: { songId: string; name: string; type: string; bytes: Uint8Array }[],
): Backup {
  const own = Object.fromEntries(Object.entries(storage).filter(([k]) => k.startsWith(APP_KEY_PREFIX)));
  const b: Backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    storage: own,
    teacher: teacher.map((t) => ({
      freq: t.freq,
      sampleRate: t.sampleRate,
      createdAt: t.createdAt,
      audio: floatToBase64(t.data),
      ...(t.target !== undefined ? { target: t.target } : {}),
      ...(t.syllable ? { syllable: t.syllable } : {}),
    })),
  };
  if (songFiles) b.songFiles = songFiles.map((f) => ({ songId: f.songId, name: f.name, type: f.type, data: bytesToBase64(f.bytes) }));
  return b;
}

/** Rough file size in bytes before building it (base64 adds about a third). */
export function estimateBackupBytes(storage: Record<string, string>, teacherSamples: number[], songFileSizes: number[]): number {
  const json = Object.entries(storage).reduce((a, [k, v]) => a + k.length + v.length * 1.1 + 8, 200);
  const teacher = teacherSamples.reduce((a, n) => a + Math.ceil((n * 2) / 3) * 4 + 80, 0);
  const files = songFileSizes.reduce((a, n) => a + Math.ceil(n / 3) * 4 + 120, 0);
  return Math.round(json + teacher + files);
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `soty-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// ---- validate

export type Validation = { ok: true; backup: Backup } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

/** Checks a parsed file. Never throws; the error is plain Arabic. */
export function validateBackup(json: unknown): Validation {
  const bad = (why: string): Validation => ({ ok: false, error: 'الملف ده مش نسخة احتياطية سليمة من صوتي: ' + why });
  if (!isObj(json)) return bad('محتواه مش مفهوم.');
  if (json.app !== BACKUP_APP) return bad('ده ملف من برنامج تاني.');
  if (!num(json.version)) return bad('مفيهوش رقم إصدار.');
  if ((json.version as number) > BACKUP_VERSION) return { ok: false, error: 'الملف ده معمول من نسخة أحدث من التطبيق. حدّثي التطبيق على الجهاز ده الأول وجربي تاني.' };
  if ((json.version as number) < 1) return bad('رقم الإصدار غلط.');
  if (!isObj(json.storage)) return bad('ناقص البيانات.');
  for (const [k, v] of Object.entries(json.storage)) {
    if (!k.startsWith(APP_KEY_PREFIX) || typeof v !== 'string') return bad('فيه بيانات مش بتاعة التطبيق.');
  }
  const data = json.storage[DATA_KEY];
  if (data !== undefined) {
    try {
      const d = JSON.parse(data as string);
      if (!isObj(d) || !Array.isArray(d.results)) return bad('النتايج بايظة.');
    } catch {
      return bad('النتايج بايظة.');
    }
  }
  if (!Array.isArray(json.teacher)) return bad('ناقص تسجيلات المعلم.');
  for (const t of json.teacher) {
    if (!isObj(t) || !num(t.freq) || !num(t.sampleRate) || !num(t.createdAt) || typeof t.audio !== 'string') return bad('تسجيل من تسجيلات المعلم بايظ.');
  }
  const songs = json.storage[SONGS_KEY];
  if (songs !== undefined) {
    try {
      const list = JSON.parse(songs as string);
      if (!Array.isArray(list) || list.some((x) => !isObj(x) || typeof x.id !== 'string' || typeof x.title !== 'string')) return bad('مكتبة الأغاني بايظة.');
    } catch {
      return bad('مكتبة الأغاني بايظة.');
    }
  }
  if (json.songFiles !== undefined) {
    if (!Array.isArray(json.songFiles)) return bad('ملفات الأغاني بايظة.');
    for (const f of json.songFiles) {
      if (!isObj(f) || typeof f.songId !== 'string' || typeof f.name !== 'string' || typeof f.type !== 'string' || typeof f.data !== 'string') return bad('ملف أغنية بايظ.');
    }
  }
  return { ok: true, backup: json as unknown as Backup };
}

// ---- apply (replace or merge)

interface Data {
  range?: SavedRange;
  results: Result[];
  path?: PathData;
}

function parseData(raw: string | undefined): Data {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (d && Array.isArray(d.results)) return d;
  } catch {
    // treat as empty
  }
  return { results: [] };
}

function uniqueBy<T>(items: T[], key: (x: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const x of items) if (!seen.has(key(x))) seen.set(key(x), x);
  return [...seen.values()];
}

/** Merge two app data blobs: results combined (no duplicates), newest range, earliest baseline, weekly/workouts by date. */
export function mergeData(cur: Data, inc: Data): Data {
  const results = uniqueBy([...cur.results, ...inc.results], (r) => `${r.type}|${r.ts}|${r.value}`).sort((a, b) => a.ts - b.ts);
  const range = !cur.range ? inc.range : !inc.range ? cur.range : inc.range.date > cur.range.date ? inc.range : cur.range;
  const cp = cur.path;
  const ip = inc.path;
  let path: PathData | undefined;
  if (cp || ip) {
    const baselines = [cp?.baseline, ip?.baseline].filter((b): b is Measurement => !!b).sort((a, b) => a.date.localeCompare(b.date));
    const weekly = uniqueBy([...(cp?.weekly ?? []), ...(ip?.weekly ?? [])], (w) => w.date).sort((a, b) => a.date.localeCompare(b.date));
    // one workout per day; prefer the one with an answered throat question
    const byDay = new Map<string, WorkoutLog>();
    for (const w of [...(cp?.workouts ?? []), ...(ip?.workouts ?? [])]) {
      const have = byDay.get(w.date);
      if (!have || (have.feeling === null && w.feeling !== null)) byDay.set(w.date, w);
    }
    path = { baseline: baselines[0], weekly, workouts: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  }
  return { ...(range ? { range } : {}), results, ...(path ? { path } : {}) };
}

/**
 * What to write to localStorage. Replace: exactly the backup's keys (other app keys removed).
 * Merge: data merged, settings taken from the backup (it's what she chose to bring over), other keys kept.
 */
export function planStorage(current: Record<string, string>, backup: Backup, mode: 'replace' | 'merge'): { set: Record<string, string>; remove: string[] } {
  const curOwn = Object.keys(current).filter((k) => k.startsWith(APP_KEY_PREFIX));
  if (mode === 'replace') return { set: { ...backup.storage }, remove: curOwn.filter((k) => !(k in backup.storage)) };
  const set = { ...backup.storage };
  if (current[DATA_KEY] !== undefined || backup.storage[DATA_KEY] !== undefined) {
    set[DATA_KEY] = JSON.stringify(mergeData(parseData(current[DATA_KEY]), parseData(backup.storage[DATA_KEY])));
  }
  if (current[SONGS_KEY] !== undefined || backup.storage[SONGS_KEY] !== undefined) {
    set[SONGS_KEY] = JSON.stringify(mergeSongs(parseSongs(current[SONGS_KEY]), parseSongs(backup.storage[SONGS_KEY])));
  }
  return { set, remove: [] };
}

function parseSongs(raw: string | undefined): Song[] {
  try {
    const l = raw ? JSON.parse(raw) : [];
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

/** Song audio files to store. Replace: all. Merge: only songs that have no file here yet. */
export function planSongFiles(existingSongIds: string[], backup: Backup, mode: 'replace' | 'merge'): SongFileBackup[] {
  const files = backup.songFiles ?? [];
  if (mode === 'replace') return files;
  const have = new Set(existingSongIds);
  return files.filter((f) => !have.has(f.songId));
}

/** Teacher recordings to add. Replace: all (after clearing). Merge: only ones not already here (same createdAt). */
export function planTeacher(existingCreatedAt: number[], backup: Backup, mode: 'replace' | 'merge'): TeacherBackup[] {
  if (mode === 'replace') return backup.teacher;
  const have = new Set(existingCreatedAt);
  return backup.teacher.filter((t) => !have.has(t.createdAt));
}

/** Short Arabic summary of a backup for the confirmation box. */
export function describeBackup(b: Backup): { date: string; results: number; recordings: number; songs: number; songFiles: number } {
  return {
    date: b.createdAt.slice(0, 10),
    results: parseData(b.storage[DATA_KEY]).results.length,
    recordings: b.teacher.length,
    songs: parseSongs(b.storage[SONGS_KEY]).length,
    songFiles: b.songFiles?.length ?? 0,
  };
}
