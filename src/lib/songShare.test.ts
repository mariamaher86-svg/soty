import { describe, expect, it } from 'vitest';
import { buildSongPackage, estimateSongPackageBytes, findExistingSong, planSongImport, songPackageFileName, validateSongPackage } from './songShare';
import { normalizeSong, type Song } from './songs';

const song: Song = {
  ...normalizeSong({ title: 'احنا جنود', singer: 'الكورال', tonic: 7, scaleId: 'major', text: 'G  C\nاحنا جنود', tags: ['ترانيم'] }, 1000),
  id: 's1',
  file: { name: 'song.mp3', type: 'audio/mpeg', size: 3 },
  parts: [
    { id: 'pa', name: 'سوبرانو', file: { name: 'sop.mp3', type: 'audio/mpeg', size: 2 } },
    { id: 'pb', name: 'ألتو', file: { name: 'alto.mp3', type: 'audio/mpeg', size: 2 } },
  ],
};
const files = [
  { part: null, name: 'song.mp3', type: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3]) },
  { part: 'pa', name: 'sop.mp3', type: 'audio/mpeg', bytes: new Uint8Array([4, 5]) },
  { part: 'pb', name: 'alto.mp3', type: 'audio/mpeg', bytes: new Uint8Array([6, 7]) },
];
const phrases = [
  { start: 0, end: 2 },
  { start: 2.5, end: 5 },
];
const roundTrip = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('song export', () => {
  it('one file with details, key, lyrics, phrases, audio and parts — and it validates', () => {
    const pkg = buildSongPackage(song, phrases, files, new Date('2026-10-21T10:00:00Z'));
    const v = validateSongPackage(roundTrip(pkg));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.pkg.song.title).toBe('احنا جنود');
    expect(v.pkg.song.tonic).toBe(7);
    expect(v.pkg.song.text).toContain('G  C');
    expect(v.pkg.song.parts!.map((p) => p.id)).toEqual(['pa', 'pb']);
    expect(v.pkg.files).toHaveLength(3);
    expect(v.pkg.phrases).toEqual(phrases);
    expect(JSON.stringify(pkg)).not.toContain('results');
  });
  it('without audio: no files, no file/parts, the YouTube link would stay', () => {
    const pkg = buildSongPackage({ ...song, youtube: 'https://youtu.be/dQw4w9WgXcQ' }, null, null);
    expect(pkg.files).toEqual([]);
    expect(pkg.song.file).toBeUndefined();
    expect(pkg.song.parts).toBeUndefined();
    expect(pkg.song.youtube).toContain('youtu');
    expect(estimateSongPackageBytes(song, false)).toBeLessThan(estimateSongPackageBytes(song, true));
    expect(songPackageFileName({ ...song, title: 'a/b:c' })).toBe('soty-song-a b c.json');
  });
});

describe('song import validation', () => {
  it('rejects other files with a clear reason', () => {
    expect(validateSongPackage(null).ok).toBe(false);
    expect(validateSongPackage({ app: 'other' })).toEqual({ ok: false, error: 'الملف ده مش من تطبيق صوتي.' });
    const backup = validateSongPackage({ app: 'soty', version: 2, storage: {} });
    expect(!backup.ok && backup.error).toContain('نسخة احتياطية');
    const newer = validateSongPackage({ ...roundTrip(buildSongPackage(song, null, null)), version: 99 });
    expect(!newer.ok && newer.error).toContain('أحدث');
    const noTitle = validateSongPackage({ ...roundTrip(buildSongPackage(song, null, null)), song: { title: ' ' } });
    expect(noTitle.ok).toBe(false);
    const broken = roundTrip(buildSongPackage(song, null, files));
    broken.files[0].data = '!!!';
    expect(validateSongPackage(broken).ok).toBe(false);
  });
  it('a part listed without its audio is dropped instead of breaking the song', () => {
    const pkg = roundTrip(buildSongPackage(song, null, files));
    pkg.files = pkg.files.filter((f: { part: string | null }) => f.part !== 'pb');
    const v = validateSongPackage(pkg);
    expect(v.ok && v.pkg.song.parts!.map((p) => p.id)).toEqual(['pa']);
  });
});

describe('import plan', () => {
  const pkg = (() => {
    const v = validateSongPackage(roundTrip(buildSongPackage(song, phrases, files)));
    if (!v.ok) throw new Error(v.error);
    return v.pkg;
  })();
  it('finds the same song by id or by title + singer', () => {
    expect(findExistingSong([song], pkg.song)?.id).toBe('s1');
    expect(findExistingSong([{ ...song, id: 'other' }], pkg.song)?.id).toBe('other');
    expect(findExistingSong([{ ...song, id: 'x', title: 'غيرها' }], pkg.song)).toBeNull();
  });
  it('new song: keeps its id and stores the main file and parts under the right keys', () => {
    const p = planSongImport(pkg, null, 'keep', 'new1', 5000);
    expect(p.song.id).toBe('s1');
    expect(p.files.map((f) => f.key)).toEqual(['s1', 's1::pa', 's1::pb']);
    expect([...p.files[0].bytes]).toEqual([1, 2, 3]);
    expect(p.remove).toEqual([]);
  });
  it('keep both: a new id and "(نسخة تانية)"; replace: same id, old files removed, created date kept', () => {
    const existing = { ...song, createdAt: 42 };
    const keep = planSongImport(pkg, existing, 'keep', 'new1', 5000);
    expect(keep.song.id).toBe('new1');
    expect(keep.song.title).toBe('احنا جنود (نسخة تانية)');
    expect(keep.files.map((f) => f.key)).toEqual(['new1', 'new1::pa', 'new1::pb']);
    const rep = planSongImport(pkg, existing, 'replace', 'new1', 5000);
    expect(rep.song.id).toBe('s1');
    expect(rep.song.createdAt).toBe(42);
    expect(rep.remove).toEqual(['s1', 's1::pa', 's1::pb']);
    expect(rep.phrases).toEqual(phrases);
  });
});
