import { describe, expect, it } from 'vitest';
import { classifyVoice, comfortableRange, defaultRange, inUserOctave, octaveHint, voiceTypeGuess } from './voice';

describe('voice type', () => {
  it('classifies typical ranges', () => {
    expect(classifyVoice(40, 64).id).toBe('bass'); // E2–E4
    expect(classifyVoice(45, 68).id).toBe('baritone'); // A2–G#4
    expect(classifyVoice(48, 72).id).toBe('tenor'); // C3–C5
    expect(classifyVoice(53, 76).id).toBe('alto'); // F3–E5
    expect(classifyVoice(57, 81).id).toBe('mezzo'); // A3–A5
    expect(classifyVoice(60, 86).id).toBe('soprano'); // C4–D6
  });

  it('handles a small untrained range', () => {
    expect(classifyVoice(55, 70).id).toBe('alto'); // G3–A#4
    expect(classifyVoice(45, 60).id).toBe('baritone'); // A2–C4
    // in-between ranges also offer the neighbouring type
    const g = voiceTypeGuess(50, 74);
    expect([g.best.id, g.alt?.id].sort()).toEqual(['alto', 'tenor']);
    expect(voiceTypeGuess(40, 64).alt).toBeUndefined();
  });

  it('comfortable range trims the edges', () => {
    expect(comfortableRange(50, 74)).toEqual({ low: 52, high: 72 });
    expect(comfortableRange(60, 66)).toEqual({ low: 60, high: 66 });
  });
});


describe('voice by gender', () => {
  it('default ranges before a range test: female ≈ F3–C5, male ≈ A2–E4', () => {
    expect(defaultRange('f')).toEqual({ low: 53, high: 72 });
    expect(defaultRange('m')).toEqual({ low: 45, high: 64 });
  });
  it('classifies within the chosen voice types', () => {
    // a low female-ish range is still a female type in female mode
    expect(classifyVoice(50, 70, 'f').id).toBe('alto');
    expect(classifyVoice(50, 70, 'm').id).toBe('tenor');
    expect(classifyVoice(60, 84, 'm').id).toBe('tenor'); // highest male type, never soprano
    expect(classifyVoice(40, 60, 'f').id).toBe('alto'); // lowest female type, never bass
    expect(['bass', 'baritone', 'tenor']).toContain(voiceTypeGuess(45, 66, 'm').best.id);
    expect(['alto', 'mezzo', 'soprano']).toContain(voiceTypeGuess(57, 79, 'f').best.id);
  });
  it('reference notes are played in the user’s own octave', () => {
    expect(inUserOctave(72, 45, 64)).toBe(60); // C5 for a man → C4
    expect(inUserOctave(43, 53, 72)).toBe(55); // G2 for a woman → G3
    expect(inUserOctave(60, 53, 72)).toBe(60); // already inside
    expect(inUserOctave(70, 58, 62)).toBe(58); // range smaller than an octave: closest to its middle
  });
  it('spots singing an octave below/above, not just being off', () => {
    const below = Array.from({ length: 20 }, (_, i) => -1200 + (i % 5) * 10 - 20);
    expect(octaveHint(below)).toBe('below');
    expect(octaveHint(below.map((c) => -c))).toBe('above');
    expect(octaveHint(Array.from({ length: 20 }, () => -150))).toBeNull(); // just flat
    expect(octaveHint([-1200, -1200, -1200])).toBeNull(); // too few readings
    expect(octaveHint([...Array(10).fill(-1200), ...Array(10).fill(0)])).toBeNull(); // mixed
  });
  it('default ranges make the octave hint rare: every default note is in its own octave', () => {
    for (const gender of ['f', 'm'] as const) {
      const r = defaultRange(gender);
      for (let m = r.low; m <= r.high; m++) expect(inUserOctave(m, r.low, r.high)).toBe(m);
    }
  });
});
