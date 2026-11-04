import { describe, expect, it } from 'vitest';
import { chosenLabel, keyFraction, keyNames, miniFrame, octavesOff, retargetToRange, sameNameKeys, scrollForFraction, scrollToKeep, WHITE_COUNT, centsToTarget, isBlack, keyboardLayout, keyLabel, keyX, nearestKey, PIANO_HOLD_MS, PIANO_TOLERANCE, rangeNote, targetFreq } from './keyboard';
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

describe('names for memorizing', () => {
  it('white keys: E2 + مي; black keys: both spellings', () => {
    expect(keyNames(40)).toEqual({ letter: 'E2', solfege: 'مي' });
    expect(keyNames(39)).toEqual({ letter: 'D♯2', flat: 'E♭2', solfege: 'ري#' });
    expect(keyNames(70)).toEqual({ letter: 'A♯4', flat: 'B♭4', solfege: 'لا#' });
    expect(chosenLabel(40)).toBe('مي — E2');
    expect(chosenLabel(39)).toBe('ري# — D♯2 / E♭2');
  });
  it('every key with the same name, across C2–C7', () => {
    expect(sameNameKeys(40)).toEqual([40, 52, 64, 76, 88]); // every E
    expect(sameNameKeys(60)).toEqual([36, 48, 60, 72, 84, 96]); // six C's
  });
});

describe('singing it in her own octave', () => {
  it('the same name inside her range, nearest to what she sings', () => {
    expect(retargetToRange(40, 53, 72)).toBe(64); // E2 for a voice F3–C5 → E4
    expect(retargetToRange(40, 45, 72)).toBe(52); // lower voice: nearest E is E3
    expect(retargetToRange(40, 45, 72, 64)).toBe(64); // she's actually singing E4
    expect(retargetToRange(64, 53, 72)).toBe(64); // already fine
    expect(retargetToRange(88, 53, 72) % 12).toBe(4);
    expect(retargetToRange(40, 65, 67) % 12).toBe(4); // a narrow range without an E: still an E, on the keyboard
  });
  it('whole octaves off, one or more; near misses are not octave problems', () => {
    expect(octavesOff(Array(20).fill(1205))).toBe(1);
    expect(octavesOff(Array(20).fill(2395))).toBe(2);
    expect(octavesOff(Array(20).fill(-1190))).toBe(-1);
    expect(octavesOff(Array(20).fill(30))).toBe(0);
    expect(octavesOff(Array(20).fill(700))).toBe(0); // a fifth off, not an octave
    expect(octavesOff(Array(5).fill(1200))).toBe(0); // too few readings
    expect(octavesOff([...Array(10).fill(1200), ...Array(10).fill(500)])).toBe(0); // not steady
  });
});

describe('mini-map', () => {
  const W = WHITE_COUNT * 46;
  it('a key sits at its share of the whole keyboard', () => {
    expect(keyFraction(36)).toBeCloseTo(0.5 / 36);
    expect(keyFraction(96)).toBeCloseTo(35.5 / 36);
    expect(keyFraction(60)).toBeCloseTo(14.5 / 36);
  });
  it('the frame marks the visible part, and stays inside', () => {
    expect(miniFrame(16, 393, W, 16).left).toBeCloseTo(0);
    expect(miniFrame(16, 393, W, 16).width).toBeCloseTo(393 / W);
    expect(miniFrame(16 + W / 2, 393, W, 16).left).toBeCloseTo(0.5);
    const end = miniFrame(99999, 393, W, 16);
    expect(end.left + end.width).toBeCloseTo(1);
    expect(miniFrame(0, 5000, W).width).toBe(1);
  });
  it('tapping a spot centres it; the ends are clamped', () => {
    expect(scrollForFraction(0.5, 393, W, 16)).toBeCloseTo(W / 2 + 16 - 393 / 2);
    expect(scrollForFraction(0, 393, W, 16)).toBe(0);
    expect(scrollForFraction(1, 393, W, 16)).toBeCloseTo(W + 32 - 393);
    expect(scrollForFraction(5, 393, W, 16)).toBeCloseTo(W + 32 - 393);
    expect(miniFrame(scrollForFraction(0.5, 393, W, 16), 393, W, 16).left + 393 / W / 2).toBeCloseTo(0.5);
  });
  it('while singing: no move if her key is in view; both shown if they fit; otherwise the target stays', () => {
    expect(scrollToKeep(100, 150, 46, 0, 393)).toBeNull();
    const both = scrollToKeep(600, 400, 46, 0, 393)!;
    expect(400).toBeGreaterThanOrEqual(both);
    expect(646).toBeLessThanOrEqual(both + 393);
    expect(scrollToKeep(1500, 100, 46, 0, 393)).toBeNull(); // too far apart: stay on the target
    const back = scrollToKeep(1500, 100, 46, 900, 393)!; // target went out of view: bring it back
    expect(100).toBeGreaterThanOrEqual(back);
    expect(146).toBeLessThanOrEqual(back + 393);
    expect(scrollToKeep(800, null, 46, 0, 393)).toBeCloseTo(800 - (393 - 46) / 2); // free mode: follow her voice
  });
});
