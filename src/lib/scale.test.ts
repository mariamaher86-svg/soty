import { describe, expect, it } from 'vitest';
import { checkScale, inScale, nearestDegree, SCALES, spellScale } from './scale';
import { midiToFreq, shiftCents } from './music';
import { parseYouTubeId } from './youtube';
import type { PitchPoint } from './compare';

const scale = (id: string) => SCALES.find((s) => s.id === id)!.pcs;
const G = midiToFreq(55); // G3
const C = midiToFreq(60); // C4

describe('scale membership', () => {
  it('G major: F# is in, F natural is out', () => {
    expect(inScale(midiToFreq(66), G, scale('major'))).toBe(true); // F#4
    expect(inScale(midiToFreq(65), G, scale('major'))).toBe(false); // F4
    expect(inScale(midiToFreq(71), G, scale('major'))).toBe(true); // B4
    expect(inScale(midiToFreq(70), G, scale('major'))).toBe(false); // B♭4
  });

  it('A minor includes the raised 7th (G#) but not C#', () => {
    const A = midiToFreq(57);
    expect(inScale(midiToFreq(60), A, scale('minor'))).toBe(true); // C
    expect(inScale(midiToFreq(68), A, scale('minor'))).toBe(true); // G#
    expect(inScale(midiToFreq(61), A, scale('minor'))).toBe(false); // C#
  });

  it('Rast on C: E half-flat is in, E and E♭ are out', () => {
    const rast = scale('rast');
    expect(inScale(shiftCents(C, 350), C, rast)).toBe(true);
    expect(inScale(midiToFreq(64), C, rast)).toBe(false); // E natural, 50 cents off
    expect(inScale(midiToFreq(63), C, rast)).toBe(false); // E♭
    expect(inScale(midiToFreq(70), C, rast)).toBe(true); // B♭ from the descending form
    expect(nearestDegree(midiToFreq(64), C, rast)).toEqual({ pc: 350, cents: expect.closeTo(50, 6) });
  });

  it('is octave-insensitive', () => {
    for (const oct of [-2, -1, 0, 1, 2]) {
      expect(inScale(midiToFreq(66 + 12 * oct), G, scale('major'))).toBe(true);
      expect(inScale(midiToFreq(65 + 12 * oct), G, scale('major'))).toBe(false);
    }
  });

  it('tolerance edges', () => {
    const b = midiToFreq(59); // B3 in G major
    expect(inScale(shiftCents(b, 40), G, scale('major'), 40)).toBe(true);
    expect(inScale(shiftCents(b, -40), G, scale('major'), 40)).toBe(true);
    expect(inScale(shiftCents(b, 41), G, scale('major'), 40)).toBe(false);
    expect(nearestDegree(shiftCents(G, -30), G, scale('major')).cents).toBeCloseTo(-30); // wraps below the tonic
  });

  it('every maqam appears as a scale', () => {
    expect(SCALES.map((s) => s.id)).toEqual(expect.arrayContaining(['rast', 'bayati', 'hijaz', 'nahawand', 'ajam', 'saba', 'kurd']));
  });
});

describe('spellScale', () => {
  const names = (tonic: number, id: string) => spellScale(tonic, scale(id), SCALES.find((x) => x.id === id)!.flats).map((n) => n.name).join(' ');
  it('spells western keys with one letter per degree', () => {
    expect(names(7, 'major')).toBe('G A B C D E F♯');
    expect(names(5, 'major')).toBe('F G A B♭ C D E');
    expect(names(9, 'minor')).toBe('A B C D E F G G♯');
  });
  it('spells maqamat with quarter tones', () => {
    expect(names(0, 'rast')).toBe('C D E½♭ F G A B♭ B½♭');
    expect(names(2, 'bayati')).toBe('D E½♭ F G A B♭ C');
    expect(names(2, 'saba')).toBe('D E½♭ F G♭ A B♭ C D♭');
    expect(names(2, 'hijaz')).toBe('D E♭ F♯ G A B♭ C');
    expect(spellScale(0, scale('rast'))[2].ar).toBe('مي نص بيمول');
  });
});

describe('checkScale over time', () => {
  const at = (n: number, f: (i: number) => number | null): PitchPoint[] => Array.from({ length: n }, (_, i) => ({ t: i * 0.02, freq: f(i) }));

  it('flags a held wrong note at its time, ignores silence', () => {
    // 1s G, 0.5s silence, 0.5s F natural (out), 1s D
    const sung = at(150, (i) => (i < 50 ? G : i < 75 ? null : i < 100 ? midiToFreq(65) : midiToFreq(62)));
    const r = checkScale(sung, G, scale('major'));
    expect(r.outRanges).toHaveLength(1);
    expect(r.outRanges[0].start).toBeCloseTo(1.5, 1);
    expect(r.outRanges[0].end).toBeCloseTo(1.98, 1);
    expect(Math.abs(r.outRanges[0].cents)).toBe(100); // F is a semitone from both E and F#
    expect(r.percentInScale).toBe(80); // 25 of 125 voiced frames
  });

  it('ignores short blips and vibrato', () => {
    const blip = at(100, (i) => (i >= 40 && i < 46 ? midiToFreq(65) : G)); // 0.12s wrong
    expect(checkScale(blip, G, scale('major')).outRanges).toHaveLength(0);
    const vibrato = at(200, (i) => shiftCents(midiToFreq(62), 45 * Math.sin(i / 3)));
    expect(checkScale(vibrato, G, scale('major')).percentInScale).toBe(100);
  });

  it('no voice = no score', () => {
    expect(checkScale(at(10, () => null), G, scale('major'))).toEqual({ percentInScale: 0, outRanges: [] });
  });
});

describe('YouTube links', () => {
  const id = 'dQw4w9WgXcQ';
  it('accepts the common link forms', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s&list=abc`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}&si=xyz`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `youtube.com/watch?v=${id}`,
      `  ${id}  `,
    ])
      expect(parseYouTubeId(url)).toBe(id);
  });
  it('rejects other links', () => {
    expect(parseYouTubeId('https://vimeo.com/123456')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeId('https://evil.com/watch?v=' + id)).toBeNull();
    expect(parseYouTubeId('hello')).toBeNull();
  });
});
