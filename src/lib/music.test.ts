import { describe, expect, it } from 'vitest';
import { centsBetween, freqToMidi, midiToFreq, nearestNote, noteName, noteNameAr, quarterToneName, shiftCents, wrapOctave } from './music';

describe('frequency <-> note', () => {
  it('A4 is 440 Hz and MIDI 69', () => {
    expect(freqToMidi(440)).toBeCloseTo(69);
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(60)).toBeCloseTo(261.626, 2);
  });

  it('names notes with octave', () => {
    expect(noteName(69)).toBe('A4');
    expect(noteName(45)).toBe('A2');
    expect(noteName(76)).toBe('E5');
    expect(noteName(61)).toBe('C#4');
    expect(noteNameAr(69)).toBe('لا 4');
    expect(noteNameAr(67)).toBe('صول 4');
  });

  it('finds nearest note and cents off', () => {
    const n = nearestNote(shiftCents(440, 15));
    expect(n.midi).toBe(69);
    expect(n.cents).toBeCloseTo(15);
    const m = nearestNote(shiftCents(440, -60));
    expect(m.midi).toBe(68);
    expect(m.cents).toBeCloseTo(40);
  });
});

describe('cents', () => {
  it('octave is 1200, semitone 100', () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200);
    expect(centsBetween(midiToFreq(70), 440)).toBeCloseTo(100);
    expect(centsBetween(440, 880)).toBeCloseTo(-1200);
  });

  it('wrapOctave ignores whole octaves', () => {
    expect(wrapOctave(1215)).toBeCloseTo(15);
    expect(wrapOctave(-1190)).toBeCloseTo(10);
    expect(wrapOctave(2400)).toBeCloseTo(0);
    expect(wrapOctave(700)).toBeCloseTo(-500);
    expect(wrapOctave(600)).toBe(600);
  });
});

describe('quarter-tone names', () => {
  it('names E half-flat', () => {
    expect(quarterToneName(63.5)).toEqual({ name: 'E½♭4', ar: 'مي نص بيمول 4' });
    expect(quarterToneName(70.5).name).toBe('B½♭4');
  });
  it('names F half-sharp (Rast 7th from G)', () => {
    expect(quarterToneName(65.5)).toEqual({ name: 'F½♯4', ar: 'فا نص دييز 4' });
  });
  it('spells black keys with flats', () => {
    expect(quarterToneName(60).name).toBe('C4');
    expect(quarterToneName(70)).toEqual({ name: 'B♭4', ar: 'سي بيمول 4' });
  });
});
