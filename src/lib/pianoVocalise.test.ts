import { describe, expect, it } from 'vitest';
import { defaultStart, followStep, GOOD_ROUND, HOLD_MS, nextClimb, offWords, patternSteps, patternTop, roundScore, STACCATO_HOLD_MS, startFollow, STEP_TIMEOUT_MS, type FollowState, type Step } from './pianoVocalise';
import { MAQAMAT } from './maqam';
import { toKeyQuarter } from './keyboard';

/** Feed `ms` of the same reading in 20 ms frames. */
const feed = (st: FollowState, steps: Step[], cents: number | null, ms: number) => {
  for (let t = 0; t < ms; t += 20) st = followStep(st, steps, cents, 20);
  return st;
};

describe('pattern → notes from a starting key', () => {
  it('each vocalise pattern', () => {
    expect(patternSteps({ kind: 'vocalise', id: 'five' }, 60).map((s) => s.midi)).toEqual([60, 62, 64, 65, 67, 65, 64, 62, 60]);
    const arp = patternSteps({ kind: 'vocalise', id: 'arp' }, 57);
    expect(arp.map((s) => s.midi)).toEqual([57, 61, 64, 61, 57]);
    expect(arp.map((s) => s.syllable)).toEqual(['ما', 'مي', 'ما', 'مي', 'ما']);
    expect(patternSteps({ kind: 'vocalise', id: 'staccato' }, 60).every((s) => s.staccato)).toBe(true);
    expect(patternSteps({ kind: 'vocalise', id: 'nee' }, 60)[0].syllable).toBe('ني');
    const oct = patternSteps({ kind: 'vocalise', id: 'octave' }, 55);
    expect(oct.map((s) => s.midi)).toEqual([55, 67, 55]);
    expect(oct.map((s) => s.afterGlide)).toEqual([false, true, true]);
    expect(patternTop(oct, 55)).toBe(12);
  });
  it('a maqam scale up and back down, quarter tones kept (Rast comes down with B♭)', () => {
    const rast = MAQAMAT.find((m) => m.id === 'rast')!;
    const s = patternSteps({ kind: 'maqam', maqam: rast }, 60).map((x) => x.midi);
    expect(s.slice(0, 8)).toEqual([60, 62, 63.5, 65, 67, 69, 70.5, 72]);
    expect(s.slice(8)).toEqual([70, 69, 67, 65, 63.5, 62, 60]);
    expect(toKeyQuarter(63.5)).toEqual({ key: 64, quarter: -0.5 }); // E half-flat
    expect(toKeyQuarter(65.5)).toEqual({ key: 65, quarter: 0.5 }); // F half-sharp
    expect(toKeyQuarter(62)).toEqual({ key: 62, quarter: 0 });
  });
});

describe('following her note by note', () => {
  const steps = patternSteps({ kind: 'vocalise', id: 'five' }, 60);
  it('hold within ±25 c for the hold time → ✔ and on to the next note', () => {
    let st = feed(startFollow(), steps, 10, HOLD_MS - 40);
    expect(st.index).toBe(0);
    st = feed(st, steps, -20, 60);
    expect(st.index).toBe(1);
    expect(st.results[0]).toEqual({ ok: true, cents: 10 }); // median of the in-tune readings
  });
  it('a short dropout is forgiven, a long one starts the hold again', () => {
    let st = feed(startFollow(), steps, 0, 300);
    st = feed(st, steps, null, 100);
    st = feed(st, steps, 0, 120);
    expect(st.index).toBe(1);
    let st2 = feed(startFollow(), steps, 0, 300);
    st2 = feed(st2, steps, null, 300);
    st2 = feed(st2, steps, 0, 120);
    expect(st2.index).toBe(0);
  });
  it("can't get it in time → ✘ with how far off, and it moves on (never stuck)", () => {
    const st = feed(startFollow(), steps, 40, STEP_TIMEOUT_MS + 20);
    expect(st.index).toBe(1);
    expect(st.results[0]).toEqual({ ok: false, cents: 40 });
    const silent = feed(startFollow(), steps, null, STEP_TIMEOUT_MS + 20);
    expect(silent.results[0]).toEqual({ ok: false, cents: null });
    expect(offWords(40)).toBe('أعلى ٤٠ سنت');
    expect(offWords(-15)).toBe('أوطى ١٥ سنت');
    expect(offWords(null)).toBe('مسمعناش');
  });
  it('an octave off is not accepted', () => {
    const st = feed(startFollow(), steps, -1200, 1000);
    expect(st.index).toBe(0);
  });
  it('the whole pattern ends with done', () => {
    let st = startFollow();
    for (let i = 0; i < steps.length; i++) st = feed(st, steps, 0, HOLD_MS + 20);
    expect(st.done).toBe(true);
    expect(st.results).toHaveLength(9);
    expect(followStep(st, steps, 0, 20)).toBe(st);
  });
  it('staccato notes need only a short hold', () => {
    const stac = patternSteps({ kind: 'vocalise', id: 'staccato' }, 60);
    const st = feed(startFollow(), stac, 5, STACCATO_HOLD_MS + 20);
    expect(st.index).toBe(1);
    expect(feed(startFollow(), steps, 5, STACCATO_HOLD_MS + 20).index).toBe(0);
  });
  it('octave slide: only the end notes are judged, the glide in between is ignored', () => {
    const oct = patternSteps({ kind: 'vocalise', id: 'octave' }, 55);
    let st = feed(startFollow(), oct, 0, HOLD_MS + 20); // bottom note ✔
    for (const c of [-1000, -700, -400, -200]) st = feed(st, oct, c, 300); // gliding up to the top note
    expect(st.index).toBe(1);
    st = feed(st, oct, 8, HOLD_MS + 20); // top note ✔
    expect(st.results[1]).toEqual({ ok: true, cents: 8 });
    // the glide time doesn't run out the top note: it gets longer than a normal note
    const slow = feed(feed(startFollow(), oct, 0, HOLD_MS + 20), oct, -600, STEP_TIMEOUT_MS + 200);
    expect(slow.index).toBe(1);
  });
});

describe('round score and auto-climb', () => {
  it('"٨ من ٩" and which notes were off', () => {
    const r = roundScore([{ ok: true, cents: 3 }, { ok: false, cents: 32 }, ...Array.from({ length: 7 }, () => ({ ok: true, cents: 0 }))]);
    expect(r).toEqual({ ok: 8, total: 9, percent: 89, off: [{ index: 1, cents: 32 }] });
    expect(roundScore([]).percent).toBe(0);
  });
  it('climbs a semitone after a good round while the top fits, turns at the top, comes back down, then finishes', () => {
    const top = 7;
    const low = 55;
    const high = 64; // starts 55..57 fit (57 + 7 = 64)
    expect(defaultStart(low)).toBe(55);
    let c = nextClimb(55, top, low, high, 'up', 90);
    expect(c).toEqual({ start: 56, dir: 'up', finished: false });
    c = nextClimb(57, top, low, high, 'up', 100);
    expect(c).toEqual({ start: 56, dir: 'down', finished: false }); // top reached: turn around
    c = nextClimb(56, top, low, high, 'down', GOOD_ROUND);
    expect(c).toEqual({ start: 55, dir: 'down', finished: false });
    expect(nextClimb(55, top, low, high, 'down', 85).finished).toBe(true);
    expect(nextClimb(56, top, low, high, 'up', 60)).toEqual({ start: 56, dir: 'up', finished: false }); // weaker round: same key again
  });
});
