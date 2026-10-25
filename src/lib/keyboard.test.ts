import { describe, expect, it } from 'vitest';
import { centsToTarget, isBlack, keyboardLayout, keyLabel, keyX, nearestKey, PIANO_HOLD_MS, PIANO_TOLERANCE, rangeNote, targetFreq } from './keyboard';
import { HoldTracker } from './stats';
import { midiToFreq, shiftCents } from './music';

describe('keyboard layout', () => {
  it('C2–C7 = 61 keys, 36 white and 25 black', () => {
    const { keys, whites } = keyboardLayout();
    expect(keys).toHaveLength(61);
    expect(whites).toBe(36);
    expect(keys.filter((k) => k.black)).toHaveLength(25);
    expect(keys[0].midi).toBe(36);
    expect(keys[keys.length - 1].midi).toBe(96);
  });
  it('white keys side by side; black keys centred on the line between their neighbours', () => {
    const { keys } = keyboardLayout(60, 72);
    const at = (m: number) => keys.find((k) => k.midi === m)!;
    expect([60, 62, 64, 65, 67, 69, 71, 72].map((m) => at(m).x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(at(61)).toEqual({ midi: 61, black: true, x: 0.7, w: 0.6 }); // C# between C and D
    expect(at(66).x).toBeCloseTo(3.7); // F# between F and G
    expect(isBlack(63)).toBe(true);
    expect(isBlack(64)).toBe(false);
    expect(keyX(60)).toBe(14); // middle C: two octaves (14 white keys) above C2
  });
  it('names in both styles, octave number separate', () => {
    expect(keyLabel(60, 'solfege')).toEqual({ main: 'دو', octave: 4 });
    expect(keyLabel(60, 'letters')).toEqual({ main: 'C', octave: 4 });
    expect(keyLabel(70, 'both')).toEqual({ main: 'لا#', second: 'A#', octave: 4 });
    expect(keyLabel(36, 'letters').octave).toBe(2);
    expect(keyLabel(96, 'solfege')).toEqual({ main: 'دو', octave: 7 });
  });
});

describe('frequencies and the sung key', () => {
  it('target frequency, with quarter tones', () => {
    expect(targetFreq(69)).toBeCloseTo(440);
    expect(targetFreq(64, -0.5)).toBeCloseTo(shiftCents(midiToFreq(64), -50));
    expect(targetFreq(65, 0.5)).toBeCloseTo(shiftCents(midiToFreq(65), 50));
    expect(centsToTarget(shiftCents(midiToFreq(64), -40), 64, -0.5)).toBeCloseTo(10); // E half-flat, sung 10 c sharp of it
  });
  it('a sung frequency → nearest key + cents', () => {
    expect(nearestKey(440)).toEqual({ midi: 69, cents: 0, onKeyboard: true });
    expect(nearestKey(shiftCents(440, 30))).toEqual({ midi: 69, cents: 30, onKeyboard: true });
    expect(nearestKey(shiftCents(440, -60))).toEqual({ midi: 68, cents: 40, onKeyboard: true });
    expect(nearestKey(midiToFreq(30)).onKeyboard).toBe(false);
  });
  it('success = ±20 cents held for a second (short glitches forgiven)', () => {
    const h = new HoldTracker(PIANO_TOLERANCE, PIANO_HOLD_MS);
    for (let i = 0; i < 30; i++) h.update(15, 16);
    expect(h.done).toBe(false);
    h.update(null, 100); // a tiny dropout
    for (let i = 0; i < 35; i++) h.update(-18, 16);
    expect(h.done).toBe(true);
    const off = new HoldTracker(PIANO_TOLERANCE, PIANO_HOLD_MS);
    for (let i = 0; i < 100; i++) off.update(25, 16);
    expect(off.done).toBe(false);
  });
  it('gentle note outside her comfortable range', () => {
    expect(rangeNote(80, 55, 76)).toBe('high');
    expect(rangeNote(50, 55, 76)).toBe('low');
    expect(rangeNote(60, 55, 76)).toBeNull();
  });
});
