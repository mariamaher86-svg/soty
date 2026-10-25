// "صدّري الأغنية" / "استوردي أغنية": one song in one file (details, key, lyrics/chords, phrases, reference audio
// and choir parts — never her results), and checking such a file before importing it.

import { bytesToBase64, base64ToBytes } from './backup';
import { partKey } from './choir';
import { normalizeAr, normalizeSong, validateSong, type Song } from './songs';
import type { Phrase } from './phrases';

export const SONG_KIND = 'soty-song';
export const SONG_PACKAGE_VERSION = 1;

export interface SongPackageFile {
  /** null = the song's main audio; otherwise a choir part id */
  part: string | null;
  name: string;
  type: string;
  data: string; // base64
}

export interface SongPackage {
  app: 'soty';
  kind: typeof SONG_KIND;
  version: number;
  createdAt: string;
  song: Song;
  phrases?: Phrase[];
  files: SongPackageFile[];
}

/** Builds the file. `files` null = "without audio": the song keeps its YouTube link but drops file and parts. */
export function buildSongPackage(song: Song, phrases: Phrase[] | null, files: { part: string | null; name: string; type: string; bytes: Uint8Array }[] | null, now = new Date()): SongPackage {
  const s: Song = { ...song };
  if (!files) {
    delete s.file;
    delete s.parts;
  }
  return {
    app: 'soty',
    kind: SONG_KIND,
    version: SONG_PACKAGE_VERSION,
    createdAt: now.toISOString(),
    song: s,
    phrases: phrases?.length ? phrases : undefined,
    files: (files ?? []).map((f) => ({ part: f.part, name: f.name, type: f.type, data: bytesToBase64(f.bytes) })),
  };
}

/** About how big the file will be (base64 = 4/3 of the audio). */
export function estimateSongPackageBytes(song: Song, withAudio: boolean): number {
  const audio = withAudio ? (song.file?.size ?? 0) + (song.parts ?? []).reduce((a, p) => a + p.file.size, 0) : 0;
  return Math.round(audio * (4 / 3)) + JSON.stringify(song).length * 2 + 2000;
}

export function songPackageFileName(song: Song): string {
  const safe = song.title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 60) || 'song';
  return `soty-song-${safe}.json`;
}

export type SongValidation = { ok: true; pkg: SongPackage } | { ok: false; error: string };

const isB64 = (x: unknown) => typeof x === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(x);

/** Checks a file is a song from this app, fixable bits fixed (parts/file without audio are dropped). */
export function validateSongPackage(json: unknown): SongValidation {
  const bad = (error: string): SongValidation => ({ ok: false, error });
  if (!json || typeof json !== 'object') return bad('الملف ده مش ملف أغنية من صوتي.');
  const p = json as Partial<SongPackage> & { storage?: unknown };
  if (p.app !== 'soty') return bad('الملف ده مش من تطبيق صوتي.');
  if (p.kind !== SONG_KIND) return bad(p.storage ? 'ده ملف نسخة احتياطية كاملة — افتحيه من «💾 بياناتك» في ⚙️ المزيد.' : 'الملف ده مش ملف أغنية.');
  if (typeof p.version !== 'number' || p.version > SONG_PACKAGE_VERSION) return bad('الملف ده من نسخة أحدث من التطبيق — حدّثي التطبيق الأول.');
  const s = p.song as Partial<Song> | undefined;
  if (!s || typeof s !== 'object' || typeof s.title !== 'string') return bad('الملف ناقص: مفيش بيانات الأغنية.');
  const errs = validateSong(s);
  if (errs.length) return bad('بيانات الأغنية مش سليمة: ' + errs.join(' '));
  const files = Array.isArray(p.files) ? p.files : [];
  for (const f of files) {
    if (!f || typeof f.name !== 'string' || typeof f.type !== 'string' || !isB64(f.data) || !(f.part === null || typeof f.part === 'string')) return bad('ملف صوت جوه الأغنية بايظ.');
  }
  const has = (part: string | null) => files.some((f) => f.part === part);
  const parts = (Array.isArray(s.parts) ? s.parts : []).filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && x.file && has(x.id));
  const phrases = Array.isArray(p.phrases) ? p.phrases.filter((x) => x && Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start) : undefined;
  const song: Song = {
    ...normalizeSong({ ...s, title: s.title }, typeof s.updatedAt === 'number' ? s.updatedAt : Date.now()),
    id: typeof s.id === 'string' && s.id ? s.id : normalizeSong({ title: s.title }).id,
    tags: Array.isArray(s.tags) ? s.tags.filter((t): t is string => typeof t === 'string') : [],
    file: s.file && has(null) ? s.file : undefined,
    parts: parts.length ? parts : undefined,
  };
  const known = new Set([null, ...parts.map((x) => x.id)]);
  return { ok: true, pkg: { ...(p as SongPackage), song, phrases: phrases?.length ? phrases : undefined, files: files.filter((f) => known.has(f.part)) } };
}

/** The song already in her library: same id, or same title and singer. */
export function findExistingSong(songs: Song[], incoming: Song): Song | null {
  const key = (s: Song) => normalizeAr(`${s.title}|${s.singer ?? ''}`);
  return songs.find((s) => s.id === incoming.id) ?? songs.find((s) => key(s) === key(incoming)) ?? null;
}

export interface SongImportPlan {
  song: Song;
  /** IndexedDB song files to write */
  files: { key: string; name: string; type: string; bytes: Uint8Array }[];
  /** stored files to delete first (the replaced song's) */
  remove: string[];
  phrases?: Phrase[];
}

/**
 * keep = add as a new song next to the old one ("(نسخة تانية)"); replace = same id as the old one, its files replaced
 * (her results for it stay, since they're linked by id).
 */
export function planSongImport(pkg: SongPackage, existing: Song | null, mode: 'keep' | 'replace', newId: string, now = Date.now()): SongImportPlan {
  const replace = !!existing && mode === 'replace';
  const id = replace ? existing.id : existing ? newId : pkg.song.id;
  const song: Song = {
    ...pkg.song,
    id,
    title: existing && !replace ? `${pkg.song.title} (نسخة تانية)` : pkg.song.title,
    createdAt: replace ? existing.createdAt : now,
    updatedAt: now,
  };
  const remove = replace ? [existing.id, ...(existing.parts ?? []).map((p) => partKey(existing.id, p.id))] : [];
  const files = pkg.files.map((f) => ({ key: f.part === null ? id : partKey(id, f.part), name: f.name, type: f.type, bytes: base64ToBytes(f.data) }));
  return { song, files, remove, phrases: pkg.phrases };
}
