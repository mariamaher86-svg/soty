import { describe, expect, it } from 'vitest';
import { backupFileName, base64ToFloat, buildBackup, floatToBase64, mergeData, planStorage, planTeacher, validateBackup, BACKUP_VERSION } from './backup';
import type { Result } from './storage';

const result = (type: Result['type'], date: string, value: number, ts: number): Result => ({ type, date, value, ts });

const data = (results: Result[], extra: object = {}) => JSON.stringify({ results, ...extra });

const sample = () =>
  buildBackup(
    {
      'soty.v1': data([result('sustain', '2026-10-19', 8, 1)], { range: { low: 55, high: 72, voiceType: 'alto', date: '2026-10-19' } }),
      'soty.pref.theme': 'dark',
      'other.app': 'not ours',
    },
    [{ freq: 196, sampleRate: 8000, createdAt: 111, data: new Float32Array([0, 0.5, -0.5, 1]) }],
    new Date('2026-10-20T10:00:00Z'),
  );

describe('audio base64', () => {
  it('round-trips within 16-bit precision', () => {
    const x = new Float32Array(5000).map((_, i) => Math.sin(i / 10) * 0.8);
    const y = base64ToFloat(floatToBase64(x));
    expect(y.length).toBe(x.length);
    for (let i = 0; i < x.length; i += 97) expect(Math.abs(y[i] - x[i])).toBeLessThan(1 / 30000);
  });
  it('clips values outside -1..1', () => {
    const y = base64ToFloat(floatToBase64(new Float32Array([2, -2])));
    expect(y[0]).toBeCloseTo(1);
    expect(y[1]).toBeCloseTo(-1);
  });
});

describe('buildBackup', () => {
  it('keeps only the app keys, adds app id, version and recordings', () => {
    const b = sample();
    expect(b.app).toBe('soty');
    expect(b.version).toBe(BACKUP_VERSION);
    expect(Object.keys(b.storage).sort()).toEqual(['soty.pref.theme', 'soty.v1']);
    expect(b.teacher[0].freq).toBe(196);
    expect(base64ToFloat(b.teacher[0].audio)[1]).toBeCloseTo(0.5, 3);
    expect(backupFileName(new Date(2026, 9, 20))).toBe('soty-backup-2026-10-20.json');
  });
  it('survives JSON and validates', () => {
    const v = validateBackup(JSON.parse(JSON.stringify(sample())));
    expect(v.ok).toBe(true);
  });
});

describe('validateBackup', () => {
  it('rejects other files with an Arabic message', () => {
    for (const bad of [null, 'text', [], { app: 'other', version: 1 }, { app: 'soty' }]) {
      const v = validateBackup(bad);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error).toMatch(/[؀-ۿ]/);
    }
  });
  it('rejects a newer version and asks to update', () => {
    const v = validateBackup({ ...sample(), version: BACKUP_VERSION + 1 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('أحدث');
  });
  it('rejects old/invalid versions and broken shapes', () => {
    expect(validateBackup({ ...sample(), version: 0 }).ok).toBe(false);
    expect(validateBackup({ ...sample(), storage: { 'evil.key': 'x' } }).ok).toBe(false);
    expect(validateBackup({ ...sample(), storage: { 'soty.v1': '{broken' } }).ok).toBe(false);
    expect(validateBackup({ ...sample(), teacher: [{ freq: 'x' }] }).ok).toBe(false);
    expect(validateBackup({ ...sample(), teacher: undefined }).ok).toBe(false);
  });
});

describe('replace / merge', () => {
  const current = {
    'soty.v1': data([result('sustain', '2026-10-18', 6, 0), result('sustain', '2026-10-19', 8, 1)], {
      range: { low: 53, high: 70, voiceType: 'alto', date: '2026-10-25' },
      path: { baseline: { date: '2026-10-10' }, weekly: [{ date: '2026-10-17' }], workouts: [{ date: '2026-10-19', maqam: 'ajam', feeling: null }] },
    }),
    'soty.pref.theme': 'light',
    'soty.pref.sound': 'voice',
  };

  it('replace = exactly the backup (other app keys removed)', () => {
    const plan = planStorage(current, sample(), 'replace');
    expect(plan.set['soty.pref.theme']).toBe('dark');
    expect(plan.remove).toEqual(['soty.pref.sound']);
  });

  it('merge = results combined without duplicates, newest range, settings from the backup', () => {
    const plan = planStorage(current, sample(), 'merge');
    const merged = JSON.parse(plan.set['soty.v1']);
    expect(merged.results).toHaveLength(2); // ts 1 is in both
    expect(merged.range.date).toBe('2026-10-25'); // this device's range is newer
    expect(merged.path.baseline.date).toBe('2026-10-10');
    expect(plan.set['soty.pref.theme']).toBe('dark');
    expect(plan.remove).toEqual([]);
  });

  it('merge path: earliest baseline, weekly by date, one workout per day preferring an answered one', () => {
    const m = mergeData(
      { results: [], path: { baseline: { date: '2026-10-12' } as never, weekly: [{ date: '2026-10-19' } as never], workouts: [{ date: '2026-10-20', maqam: 'ajam', feeling: null }] } },
      { results: [], path: { baseline: { date: '2026-10-05' } as never, weekly: [{ date: '2026-10-12' } as never, { date: '2026-10-19' } as never], workouts: [{ date: '2026-10-20', maqam: 'ajam', feeling: 'no' }] } },
    );
    expect(m.path!.baseline!.date).toBe('2026-10-05');
    expect(m.path!.weekly.map((w) => w.date)).toEqual(['2026-10-12', '2026-10-19']);
    expect(m.path!.workouts).toEqual([{ date: '2026-10-20', maqam: 'ajam', feeling: 'no' }]);
  });

  it('teacher recordings: replace adds all, merge skips ones already here', () => {
    const b = sample();
    expect(planTeacher([111], b, 'replace')).toHaveLength(1);
    expect(planTeacher([111], b, 'merge')).toHaveLength(0);
    expect(planTeacher([5], b, 'merge')).toHaveLength(1);
  });
});
