// Everything is kept in this browser (localStorage). Reads/writes never throw.

import type { Measurement, WorkoutLog } from './path';

export type ResultType = 'range' | 'match' | 'maqam' | 'sustain' | 'stability' | 'hiss' | 'singalong' | 'scale' | 'ear-pitch' | 'ear-same' | 'ear-interval' | 'ear-maqam' | 'intervals' | 'loop' | 'vocalise' | 'findnote' | 'phrase' | 'rhythm' | 'game' | 'dynamics' | 'piano' | 'piano-vocalise';

export interface SavedRange {
  low: number; // MIDI
  high: number; // MIDI
  voiceType: string; // VoiceType id
  date: string;
}

export interface Result {
  type: ResultType;
  /** Day as YYYY-MM-DD (local time). */
  date: string;
  /** Main number: a score %, seconds, or cents depending on type. */
  value: number;
  /** Short human text, e.g. "راست" or "8/10". */
  detail?: string;
  ts: number;
  /** set when the result comes from a song in the library */
  songId?: string;
  /** hard moments (seconds in the song) from this session */
  moments?: { start: number; end: number }[];
}

export interface PathData {
  baseline?: Measurement;
  weekly: Measurement[];
  workouts: WorkoutLog[];
}

interface Data {
  range?: SavedRange;
  results: Result[];
  path?: PathData;
}

const KEY = 'soty.v1';

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Data;
      if (Array.isArray(d.results)) return d;
    }
  } catch {
    // storage blocked or corrupted: start fresh
  }
  return { results: [] };
}

function save(d: Data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // private mode / quota: keep working without saving
  }
}

export function today(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getRange(): SavedRange | undefined {
  return load().range;
}

export function saveRange(range: SavedRange) {
  const d = load();
  d.range = range;
  save(d);
}

export function addResult(type: ResultType, value: number, detail?: string, extra?: { songId?: string; moments?: { start: number; end: number }[] }) {
  const d = load();
  const r: Result = { type, value, detail, date: today(), ts: Date.now() };
  if (extra?.songId) r.songId = extra.songId;
  if (extra?.moments?.length) r.moments = extra.moments.map((m) => ({ start: Math.round(m.start * 10) / 10, end: Math.round(m.end * 10) / 10 }));
  d.results.push(r);
  save(d);
  // lets the badges/challenge banner notice new results
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RESULT_EVENT));
}

export const RESULT_EVENT = 'soty-result';

export function getResults(): Result[] {
  return load().results;
}

export function getPath(): PathData {
  const p = load().path;
  return { weekly: p?.weekly ?? [], workouts: p?.workouts ?? [], baseline: p?.baseline };
}

export function updatePath(fn: (p: PathData) => void) {
  const d = load();
  const p = getPath();
  fn(p);
  d.path = p;
  save(d);
}

export function clearAll() {
  save({ results: [] });
}

/** Small per-viewer preference values (theme etc.). */
export function getPref(key: string): string | null {
  try {
    return localStorage.getItem('soty.pref.' + key);
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string) {
  try {
    localStorage.setItem('soty.pref.' + key, value);
  } catch {
    // ignore
  }
}

/** All of the app's raw localStorage values (for the backup file). */
export function readAppStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('soty.')) out[k] = localStorage.getItem(k) ?? '';
    }
  } catch {
    // storage blocked
  }
  return out;
}

/** Writes/removes raw app keys (restoring a backup). Returns false if the browser refused. */
export function applyAppStorage(set: Record<string, string>, remove: string[]): boolean {
  try {
    for (const k of remove) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(set)) localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

/** Ear-training answers per level (last 50 each), kept with the settings so backups include them. */
export function getEarHistory(): Record<string, boolean[]> {
  try {
    const raw = getPref('ear.history');
    const h = raw ? JSON.parse(raw) : {};
    return h && typeof h === 'object' ? h : {};
  } catch {
    return {};
  }
}

export function addEarAnswer(level: string, right: boolean): Record<string, boolean[]> {
  const h = getEarHistory();
  h[level] = [...(h[level] ?? []), right].slice(-50);
  setPref('ear.history', JSON.stringify(h));
  return h;
}

/** Interval-singing answers per level index (last 50 each); kept with the settings so backups include them. */
export function getIntervalHistory(): boolean[][] {
  try {
    const h = JSON.parse(getPref('interval.history') ?? '[]');
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

export function addIntervalAnswer(level: number, right: boolean): boolean[][] {
  const h = getIntervalHistory();
  h[level] = [...(h[level] ?? []), right].slice(-50);
  for (let i = 0; i < h.length; i++) h[i] ??= [];
  setPref('interval.history', JSON.stringify(h));
  return h;
}

// ---- song library metadata (its own key, so it's part of the backup's app keys)

const SONGS_KEY = 'soty.songs';

export function getSongs(): import('./songs').Song[] {
  try {
    const raw = localStorage.getItem(SONGS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Saves the whole song list. Returns false if the browser refused (e.g. storage full). */
export function saveSongs(list: import('./songs').Song[]): boolean {
  try {
    localStorage.setItem(SONGS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Music-basics lessons passed: { lessonId: day passed } (kept with the settings, so backups include it). */
export function getLessonsDone(): Record<string, string> {
  try {
    const v = JSON.parse(getPref('lessons.done') ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function markLessonDone(id: string) {
  const d = getLessonsDone();
  if (!d[id]) d[id] = today();
  setPref('lessons.done', JSON.stringify(d));
}
