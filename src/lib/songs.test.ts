import { describe, expect, it } from 'vitest';
import { allTags, EXAMPLE_SONG, filterSongs, mergeSongs, normalizeAr, normalizeSong, recurringMoments, songStats, textLines, validateSong, type Song } from './songs';
import { base64ToBytes, buildBackup, bytesToBase64, describeBackup, estimateBackupBytes, planSongFiles, planStorage, validateBackup } from './backup';
import type { Result } from './storage';

const song = (id: string, title: string, extra: Partial<Song> = {}): Song => ({ id, title, tags: [], createdAt: 1, updatedAt: 1, ...extra });
const res = (type: Result['type'], value: number, ts: number, songId?: string, moments?: { start: number; end: number }[]): Result => ({ type, value, ts, date: `2026-10-${String(10 + ts).padStart(2, '0')}`, songId, moments });

describe('song validation', () => {
  it('needs a title, checks the link, key and difficulty', () => {
    expect(validateSong({ title: 'ترنيمة' })).toEqual([]);
    expect(validateSong({ title: '  ' })).toHaveLength(1);
    expect(validateSong({ title: 'x', youtube: 'https://vimeo.com/1' })[0]).toContain('اليوتيوب');
    expect(validateSong({ title: 'x', youtube: 'https://youtu.be/dQw4w9WgXcQ' })).toEqual([]);
    expect(validateSong({ title: 'x', tonic: 7.5, scaleId: 'rast' })).toEqual([]);
    expect(validateSong({ title: 'x', tonic: 12 })).toHaveLength(1);
    expect(validateSong({ title: 'x', scaleId: 'nope' })).toHaveLength(1);
    expect(validateSong({ title: 'x', difficulty: 5 as never })).toHaveLength(1);
  });
  it('normalizes a draft', () => {
    const s = normalizeSong({ title: '  أغنية ', singer: ' ', tags: ['طرب', ' طرب', ''], text: 'G  Am\nسطر\n\n' }, 50);
    expect(s.title).toBe('أغنية');
    expect(s.singer).toBeUndefined();
    expect(s.tags).toEqual(['طرب']);
    expect(s.text).toBe('G  Am\nسطر');
    expect(s.createdAt).toBe(50);
    expect(textLines('Am  G\r\nسطر')).toEqual(['Am  G', 'سطر']);
  });
  it('example song has a key and no lyrics', () => {
    expect(EXAMPLE_SONG).toEqual({ title: 'احنا جنود ويسوعنا قائدنا', tonic: 7, scaleId: 'major', tags: ['ترانيم'] });
    expect(validateSong(EXAMPLE_SONG)).toEqual([]);
  });
});

describe('results → song stats', () => {
  const results = [res('singalong', 60, 1, 'a'), res('loop', 90, 2, 'a'), res('scale', 75, 3, 'a'), res('singalong', 50, 4, 'a'), res('singalong', 99, 5, 'b'), res('match', 100, 6)];
  it('best, last, count (loops counted as sessions but not as scores)', () => {
    const s = songStats(results, 'a');
    expect(s.count).toBe(4);
    expect(s.loops).toBe(1);
    expect(s.best).toBe(75);
    expect(s.last).toBe(50);
    expect(s.lastTs).toBe(4);
    expect(s.series.map((x) => x.value)).toEqual([60, 75, 50]);
    expect(songStats(results, 'none')).toEqual({ count: 0, loops: 0, best: null, last: null, lastTs: null, series: [] });
  });
});

describe('recurring hard moments', () => {
  it('groups nearby timestamps across sessions and keeps the ones that come back', () => {
    const results = [
      res('singalong', 60, 1, 'a', [{ start: 83, end: 85 }, { start: 120, end: 121 }]),
      res('singalong', 70, 2, 'a', [{ start: 84, end: 86 }]),
      res('scale', 70, 3, 'a', [{ start: 85.5, end: 86.5 }, { start: 30, end: 31 }]),
      res('singalong', 80, 4, 'b', [{ start: 30, end: 31 }]),
    ];
    const m = recurringMoments(results, 'a');
    expect(m).toEqual([{ start: 83, end: 86.5, sessions: 3 }]); // 120 and 30 came up only once for song a
    expect(recurringMoments(results, 'a', 1.5, 1)).toHaveLength(3);
  });
  it('the same session repeating a moment does not count twice', () => {
    expect(recurringMoments([res('singalong', 1, 1, 'a', [{ start: 10, end: 11 }, { start: 11.5, end: 12 }])], 'a')).toEqual([]);
  });
});

describe('search, filter, sort', () => {
  const songs = [
    song('1', 'إحنا جنود', { tags: ['ترانيم'], createdAt: 1 }),
    song('2', 'Hallelujah', { singer: 'Leonard Cohen', tags: ['أجنبي'], createdAt: 2 }),
    song('3', 'أنا لك على طول', { singer: 'عبد الحليم', tags: ['طرب'], createdAt: 3 }),
  ];
  const results = [res('singalong', 40, 1, '3'), res('singalong', 90, 2, '1')];
  it('searches title and singer, ignoring hamza and case', () => {
    expect(filterSongs(songs, results, { query: 'احنا' }).map((s) => s.id)).toEqual(['1']);
    expect(filterSongs(songs, results, { query: 'cohen' }).map((s) => s.id)).toEqual(['2']);
    expect(normalizeAr('أُنَا')).toBe('انا');
  });
  it('filters by tag', () => {
    expect(filterSongs(songs, results, { tag: 'طرب' }).map((s) => s.id)).toEqual(['3']);
    expect(allTags(songs)).toEqual(['ترانيم', 'طرب', 'أجنبي']);
  });
  it('sorts by last practised, best score, title', () => {
    expect(filterSongs(songs, results, { sort: 'recent' }).map((s) => s.id)).toEqual(['1', '3', '2']);
    expect(filterSongs(songs, results, { sort: 'best' }).map((s) => s.id)).toEqual(['1', '3', '2']);
    expect(filterSongs(songs, results, { sort: 'title' }).map((s) => s.id)).toEqual(['1', '3', '2']); // Arabic alphabetical, Latin after
  });
});

describe('library in the backup', () => {
  const lib = [song('a', 'one', { file: { name: 'a.mp3', type: 'audio/mpeg', size: 3 }, updatedAt: 5 })];
  const storage = { 'soty.songs': JSON.stringify(lib), 'soty.v1': JSON.stringify({ results: [res('singalong', 70, 1, 'a')] }) };
  const files = [{ songId: 'a', name: 'a.mp3', type: 'audio/mpeg', bytes: new Uint8Array([1, 2, 255]) }];

  it('base64 round trip of song bytes', () => {
    const b = new Uint8Array(70000).map((_, i) => (i * 7) % 256);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
  });
  it('with and without audio files', () => {
    const full = buildBackup(storage, [], new Date(), files);
    const small = buildBackup(storage, [], new Date());
    expect(full.songFiles).toHaveLength(1);
    expect(base64ToBytes(full.songFiles![0].data)).toEqual(new Uint8Array([1, 2, 255]));
    expect(small.songFiles).toBeUndefined();
    expect(validateBackup(JSON.parse(JSON.stringify(full))).ok).toBe(true);
    expect(validateBackup(JSON.parse(JSON.stringify(small))).ok).toBe(true);
    expect(describeBackup(full)).toMatchObject({ songs: 1, songFiles: 1, results: 1 });
    expect(estimateBackupBytes(storage, [], [3_000_000])).toBeGreaterThan(4_000_000);
    expect(estimateBackupBytes(storage, [], [])).toBeLessThan(2000);
  });
  it('old version-1 files are still accepted; broken library rejected', () => {
    expect(validateBackup({ ...buildBackup(storage, []), version: 1 }).ok).toBe(true);
    expect(validateBackup({ ...buildBackup({ 'soty.songs': '[{"x":1}]' }, []) }).ok).toBe(false);
    expect(validateBackup({ ...buildBackup(storage, []), songFiles: [{ songId: 1 }] }).ok).toBe(false);
  });
  it('merge combines songs by id (newer edit wins) and only adds missing files', () => {
    const here = [song('a', 'one (edited here)', { updatedAt: 9 }), song('b', 'two')];
    const plan = planStorage({ 'soty.songs': JSON.stringify(here) }, buildBackup(storage, [], new Date(), files), 'merge');
    const merged = JSON.parse(plan.set['soty.songs']) as Song[];
    expect(merged.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(merged.find((s) => s.id === 'a')!.title).toBe('one (edited here)');
    expect(mergeSongs([song('x', 'old', { updatedAt: 1 })], [song('x', 'new', { updatedAt: 2 })])[0].title).toBe('new');
    const backup = buildBackup(storage, [], new Date(), files);
    expect(planSongFiles(['a'], backup, 'merge')).toHaveLength(0);
    expect(planSongFiles([], backup, 'merge')).toHaveLength(1);
    expect(planSongFiles(['a'], backup, 'replace')).toHaveLength(1);
  });
});
