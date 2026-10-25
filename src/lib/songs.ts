// Song library ("مكتبة أغانيّ"): song records, validation, stats from results, recurring hard moments, search.

import { SCALES } from './scale';
import { parseYouTubeId } from './youtube';
import type { Result } from './storage';
import type { SongPart } from './choir';

export interface SongFileInfo {
  name: string;
  type: string;
  size: number; // bytes
}

export interface Song {
  id: string;
  title: string;
  singer?: string;
  youtube?: string;
  /** set when an audio file for this song is stored in IndexedDB */
  file?: SongFileInfo;
  /** choir part recordings (soprano, alto…), each stored like the main file under partKey(song, part) */
  parts?: SongPart[];
  /** semitones above C, steps of 0.5 */
  tonic?: number;
  scaleId?: string;
  /** her own lyrics / chords text */
  text?: string;
  notes?: string;
  tags: string[];
  difficulty?: 1 | 2 | 3;
  createdAt: number;
  updatedAt: number;
}

export const SUGGESTED_TAGS = ['ترانيم', 'طرب', 'أجنبي'];
export const DIFFICULTY_AR: Record<1 | 2 | 3, string> = { 1: 'سهلة', 2: 'متوسطة', 3: 'صعبة' };

/** One-tap example (no lyrics text). */
export const EXAMPLE_SONG = { title: 'احنا جنود ويسوعنا قائدنا', tonic: 7, scaleId: 'major', tags: ['ترانيم'] };

export function newSongId(): string {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Problems with a song (Arabic), empty if it's fine. */
export function validateSong(s: Partial<Song>): string[] {
  const errs: string[] = [];
  if (!s.title || !s.title.trim()) errs.push('اكتبي اسم الأغنية.');
  if (s.title && s.title.length > 120) errs.push('اسم الأغنية طويل قوي.');
  if (s.youtube && s.youtube.trim() && !parseYouTubeId(s.youtube)) errs.push('لينك اليوتيوب مش مظبوط.');
  if (s.tonic !== undefined && !(s.tonic >= 0 && s.tonic < 12 && Number.isInteger(s.tonic * 2))) errs.push('القرار مش مظبوط.');
  if (s.scaleId !== undefined && !SCALES.some((x) => x.id === s.scaleId)) errs.push('السلم/المقام مش معروف.');
  if (s.difficulty !== undefined && ![1, 2, 3].includes(s.difficulty)) errs.push('الصعوبة لازم تكون سهلة أو متوسطة أو صعبة.');
  if (s.text && s.text.length > 20000) errs.push('النص طويل قوي.');
  return errs;
}

/** Cleans a draft into a song (trimmed strings, unique tags). */
export function normalizeSong(d: Partial<Song> & { title: string }, now = Date.now()): Song {
  const clean = (x?: string) => (x && x.trim() ? x.trim() : undefined);
  return {
    id: d.id ?? newSongId(),
    title: d.title.trim(),
    singer: clean(d.singer),
    youtube: clean(d.youtube),
    file: d.file,
    parts: d.parts?.length ? d.parts : undefined,
    tonic: d.tonic,
    scaleId: d.scaleId,
    text: d.text && d.text.trim() ? d.text.replace(/\s+$/, '') : undefined,
    notes: clean(d.notes),
    tags: [...new Set((d.tags ?? []).map((t) => t.trim()).filter(Boolean))],
    difficulty: d.difficulty,
    createdAt: d.createdAt ?? now,
    updatedAt: now,
  };
}

// ---- stats from results

const SESSION_TYPES = ['singalong', 'scale'];

export interface SongStats {
  /** all practice sessions, loops included */
  count: number;
  loops: number;
  best: number | null;
  last: number | null;
  lastTs: number | null;
  series: { date: string; value: number }[];
}

export function songStats(results: Result[], songId: string): SongStats {
  const mine = results.filter((r) => r.songId === songId).sort((a, b) => a.ts - b.ts);
  const sessions = mine.filter((r) => SESSION_TYPES.includes(r.type));
  return {
    count: mine.length,
    loops: mine.filter((r) => r.type === 'loop').length,
    best: sessions.length ? Math.max(...sessions.map((r) => r.value)) : null,
    last: sessions.length ? sessions[sessions.length - 1].value : null,
    lastTs: mine.length ? mine[mine.length - 1].ts : null,
    series: sessions.map((r) => ({ date: r.date, value: r.value })),
  };
}

/**
 * Hard moments that keep coming back: moments from different sessions that are within `gap` seconds of
 * each other are grouped; groups seen in at least `minSessions` sessions are returned (most frequent first).
 */
export function recurringMoments(results: Result[], songId: string, gap = 1.5, minSessions = 2): { start: number; end: number; sessions: number }[] {
  const all = results
    .filter((r) => r.songId === songId && r.moments?.length)
    .flatMap((r) => r.moments!.map((m) => ({ ...m, session: r.ts })))
    .sort((a, b) => a.start - b.start);
  const groups: { start: number; end: number; sessions: Set<number> }[] = [];
  for (const m of all) {
    const g = groups[groups.length - 1];
    if (g && m.start <= g.end + gap) {
      g.end = Math.max(g.end, m.end);
      g.sessions.add(m.session);
    } else groups.push({ start: m.start, end: m.end, sessions: new Set([m.session]) });
  }
  return groups
    .filter((g) => g.sessions.size >= minSessions)
    .map((g) => ({ start: g.start, end: g.end, sessions: g.sessions.size }))
    .sort((a, b) => b.sessions - a.sessions || a.start - b.start);
}

// ---- search / filter / sort

/** Arabic-friendly normalisation for search (hamza forms, taa marbuta, alef maqsura, diacritics). */
export function normalizeAr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

export type SongSort = 'recent' | 'best' | 'title';

export function filterSongs(songs: Song[], results: Result[], opts: { query?: string; tag?: string; sort?: SongSort }): Song[] {
  const q = normalizeAr(opts.query ?? '');
  const stats = new Map(songs.map((s) => [s.id, songStats(results, s.id)]));
  const list = songs.filter((s) => (!q || normalizeAr(`${s.title} ${s.singer ?? ''}`).includes(q)) && (!opts.tag || s.tags.includes(opts.tag)));
  const sort = opts.sort ?? 'recent';
  return [...list].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'ar');
    if (sort === 'best') return (stats.get(b.id)!.best ?? -1) - (stats.get(a.id)!.best ?? -1) || a.title.localeCompare(b.title, 'ar');
    const la = stats.get(a.id)!.lastTs ?? 0;
    const lb = stats.get(b.id)!.lastTs ?? 0;
    return lb - la || b.createdAt - a.createdAt; // never practised: newest first, after practised ones
  });
}

export function allTags(songs: Song[]): string[] {
  return [...new Set([...SUGGESTED_TAGS.filter((t) => songs.some((s) => s.tags.includes(t))), ...songs.flatMap((s) => s.tags)])];
}

/** Merge two song lists by id: the more recently edited copy wins. */
export function mergeSongs(a: Song[], b: Song[]): Song[] {
  const byId = new Map<string, Song>();
  for (const s of [...a, ...b]) {
    const have = byId.get(s.id);
    if (!have || s.updatedAt > have.updatedAt) byId.set(s.id, s);
  }
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt);
}

/** Split her text into lines; each line gets its own direction (chord lines LTR, Arabic lines RTL). */
export function textLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}
