import { describe, expect, it } from 'vitest';
import { dotPosition, ladderCents, ladderGuide, ladderNotes, ladderTip, LADDER_TOLERANCE } from './ladder';
import { noteAt, patternLength, VOCALISES, vocaliseKeys, vocaliseNotes } from './vocalise';
import { buildCarSession, segmentSeconds, sessionExercises, sessionSeconds } from './carSession';
import { VIDEOS } from '../content/videos';
import { adjustPhrase, phraseNotes, splitPhrases } from './phrases';
import { checkTake, syllableFor, syllableTargets, TEACHER_TOLERANCE } from './teacherCheck';
import { midiToFreq, shiftCents } from './music';
import type { PitchPoint } from './compare';

describe('teacher pitch check', () => {
  const seg = (freq: number, len = 1.2) => ({ freq, start: 0.5, end: 0.5 + len });
  it('saves only steady takes within ±30 cents of the target', () => {
    expect(checkTake(seg(shiftCents(midiToFreq(60), 20)), 60)).toEqual({ ok: true, cents: 20 });
    expect(checkTake(seg(shiftCents(midiToFreq(60), -TEACHER_TOLERANCE)), 60).ok).toBe(true);
    expect(checkTake(seg(shiftCents(midiToFreq(60), 45)), 60)).toEqual({ ok: false, reason: 'off', cents: 45 });
    expect(checkTake(seg(midiToFreq(48)), 60)).toEqual({ ok: false, reason: 'octave', cents: -1200 });
    expect(checkTake(seg(midiToFreq(60), 0.3), 60)).toEqual({ ok: false, reason: 'unsteady' });
    expect(checkTake(null, 60)).toEqual({ ok: false, reason: 'unsteady' });
  });
  it('do re mi targets fit the range, and every note is named after its syllable', () => {
    const t = syllableTargets(53, 72);
    expect(t.map((x) => x.syl)).toEqual(['do', 're', 'mi', 'fa', 'sol', 'la', 'si']);
    expect(t[0].midi % 12).toBe(0);
    expect(t[6].midi - t[0].midi).toBe(11);
    expect(syllableTargets(45, 64)[0].midi).toBe(48); // male range: C3
    expect(syllableFor(64)).toBe('mi');
    expect(syllableFor(61)).toBe('do'); // C# → do
    expect(syllableFor(71)).toBe('si');
  });
});

describe('note ladder', () => {
  it('do re mi fa sol and back down', () => {
    expect(ladderNotes(60)).toEqual([60, 62, 64, 65, 67, 65, 64, 62, 60]);
  });
  it('arrows: below → up, above → down; an octave away still counts, folded', () => {
    expect(ladderGuide(-80)).toBe('up');
    expect(ladderGuide(80)).toBe('down');
    expect(ladderGuide(LADDER_TOLERANCE)).toBe('ok');
    expect(ladderGuide(null)).toBe('none');
    expect(ladderCents(-1190)).toEqual({ cents: 10, octave: true });
    expect(ladderCents(-30)).toEqual({ cents: -30, octave: false });
    expect(dotPosition(0)).toBe(0.5);
    expect(dotPosition(-9999)).toBe(0);
  });
  it('gentle tips only after a while', () => {
    expect(ladderTip(5, [-300])).toBeNull();
    expect(ladderTip(12, [])).toContain('مسمعناش');
    expect(ladderTip(12, [-300, -280])).toContain('بعيدة');
    expect(ladderTip(12, [-80, -60])).toContain('أوطى');
    expect(ladderTip(12, [80, 60])).toContain('أعلى');
  });
});

describe('vocalises', () => {
  const five = VOCALISES.find((v) => v.id === 'five')!;
  it('notes of one repetition with syllables and timing', () => {
    const n = vocaliseNotes(five, 55);
    expect(n.map((x) => x.midi)).toEqual([55, 57, 59, 60, 62, 60, 59, 57, 55]);
    expect(n[0].syllable).toBe('آه');
    expect(n[2].t).toBeCloseTo(0.9);
    expect(patternLength(five)).toBeCloseTo(9 * 0.45);
    const st = VOCALISES.find((v) => v.id === 'staccato')!;
    expect(vocaliseNotes(st, 55)[1].t).toBeCloseTo(0.45); // note + gap
    expect(noteAt(n, 0.5)?.midi).toBe(57);
  });
  it('starts low, goes up a semitone each time, then back down — always inside the range', () => {
    const keys = vocaliseKeys(five, 55, 70, 6);
    expect(keys).toEqual([55, 56, 57, 58, 59, 60, 61, 60, 59, 58, 57, 56, 55]);
    for (const k of keys) expect(k + 7).toBeLessThanOrEqual(70);
    const oct = VOCALISES.find((v) => v.id === 'octave')!;
    expect(Math.max(...vocaliseKeys(oct, 55, 70))).toBe(58); // top of the octave slide = 70
    expect(vocaliseKeys(oct, 60, 66)).toEqual([60]); // range smaller than the pattern: one key
  });
});

describe('car mode session', () => {
  it('about the chosen length, with speech, notes and pauses, all inside the range', () => {
    for (const minutes of [10, 15, 20]) {
      const s = buildCarSession(minutes, 53, 72);
      const secs = sessionSeconds(s);
      expect(secs).toBeGreaterThan(minutes * 60 * 0.85);
      expect(secs).toBeLessThan(minutes * 60 * 1.25);
      expect(s[0].kind).toBe('say');
      for (const seg of s)
        if (seg.kind === 'notes')
          for (const n of seg.notes) {
            expect(n.midi).toBeGreaterThanOrEqual(53 - 4);
            expect(n.midi).toBeLessThanOrEqual(72 + 0.01);
          }
    }
    expect(segmentSeconds({ kind: 'pause', seconds: 3, label: '' })).toBe(3);
    expect(buildCarSession(15, 45, 64).some((x) => x.kind === 'say' && x.text.includes('مقام'))).toBe(true);
  });
});

describe('song phrases', () => {
  const curve: PitchPoint[] = [];
  const add = (t0: number, t1: number, midi: number | null) => {
    for (let t = t0; t < t1 - 1e-9; t += 0.02) curve.push({ t, freq: midi === null ? null : midiToFreq(midi) });
  };
  add(0, 1, 60);
  add(1, 2, 62);
  add(2, 2.6, null);
  add(2.6, 3.6, 63.5);
  add(3.6, 4.4, 65);
  add(4.4, 5, null);
  add(5, 5.3, 67);
  it('splits by silences and merges very short phrases', () => {
    const p = splitPhrases(curve, 0.4, 0.8);
    expect(p).toHaveLength(2); // the 0.3 s blip at the end joins the second phrase
    expect(p[0].start).toBeCloseTo(0);
    expect(p[0].end).toBeCloseTo(2, 1);
    expect(p[1].start).toBeCloseTo(2.6, 1);
    expect(p[1].end).toBeCloseTo(5.3, 1);
    expect(adjustPhrase(p[0], 'start', -1, 10).start).toBe(0);
    expect(adjustPhrase(p[0], 'end', -5, 10).end).toBeCloseTo(0.3);
  });
  it('turns a phrase into notes, keeping quarter tones', () => {
    const [, second] = splitPhrases(curve, 0.4, 0.8);
    expect(phraseNotes(curve, second).map((n) => n.midi)).toEqual([63.5, 65, 67]);
    expect(phraseNotes(curve, second)[0].dur).toBeCloseTo(0.98, 1);
    expect(phraseNotes(curve, { start: 0, end: 2 }).map((n) => n.midi)).toEqual([60, 62]);
  });
});

describe('YouTube searches', () => {
  it('every exercise has an Arabic and an English query', () => {
    for (const [k, v] of Object.entries(VIDEOS)) {
      expect(v.ar.trim(), k).not.toBe('');
      expect(v.en.trim(), k).not.toBe('');
      expect(/[؀-ۿ]/.test(v.ar), k).toBe(true);
      expect(/[a-z]/i.test(v.en), k).toBe(true);
    }
    for (const v of VOCALISES) expect(VIDEOS[v.video]).toBeDefined();
  });
  it('car mode lists each exercise once, with a video, before driving', () => {
    const list = sessionExercises(buildCarSession(15, 53, 72));
    expect(list.map((e) => e.title)).toContain('سلم دو ري مي');
    expect(new Set(list.map((e) => e.title)).size).toBe(list.length);
    for (const e of list) expect(VIDEOS[e.video]).toBeDefined();
  });
});
