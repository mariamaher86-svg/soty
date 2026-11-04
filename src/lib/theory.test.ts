import { describe, expect, it } from 'vitest';
import { AJNAS, buildScale, keyChords, keysForChords, maqamChart, MAQAM_FACTS, SCALE_PATTERNS, stepsOf, triad } from './theory';
import { MAQAMAT } from './maqam';

const names = (kind: Parameters<typeof buildScale>[0], tonic: string) => buildScale(kind, tonic).notes.map((n) => n.name).join(' ');

describe('scales built step by step', () => {
  it('major from C is all white keys; from G it needs F♯', () => {
    expect(names('major', 'C')).toBe('C D E F G A B C');
    expect(names('major', 'G')).toBe('G A B C D E F♯ G');
    expect(buildScale('major', 'G').steps).toEqual([200, 200, 100, 200, 200, 200, 100]);
  });
  it('natural minor and the raised 7th', () => {
    expect(names('minor', 'A')).toBe('A B C D E F G A');
    expect(names('harmonic', 'A')).toBe('A B C D E F G♯ A');
  });
  it('every pattern adds up to an octave', () => {
    for (const k of Object.values(SCALE_PATTERNS)) expect(k.steps.reduce((a, b) => a + b)).toBe(1200);
  });
});

describe('maqamat agree with the table the exercises use', () => {
  const EXPECTED: Record<string, string> = {
    ajam: 'B♭ C D E♭ F G A B♭',
    nahawand: 'C D E♭ F G A♭ B C',
    kurd: 'D E♭ F G A B♭ C D',
    rast: 'C D E½♭ F G A B½♭ C',
    bayati: 'D E½♭ F G A B♭ C D',
    hijaz: 'D E♭ F♯ G A B♭ C D',
    saba: 'D E½♭ F G♭ A B♭ C D♭',
  };
  for (const [id, expected] of Object.entries(EXPECTED))
    it(id, () => {
      const c = maqamChart(id);
      const m = MAQAMAT.find((x) => x.id === id)!;
      expect(c.up.map((n) => n.name).join(' ')).toBe(expected);
      expect(c.up.map((n) => n.cents)).toEqual(m.up);
      expect(c.steps).toEqual(stepsOf(m.up));
      expect(c.up[0].name).toBe(MAQAM_FACTS[id].tonic);
      expect(c.ghammaz).toEqual(c.up[MAQAM_FACTS[id].ghammaz - 1]);
    });
  it('each jins is the first four notes of its maqam', () => {
    for (const j of AJNAS) expect(j.cents).toEqual(MAQAMAT.find((m) => m.id === j.id)!.up.slice(0, 4));
  });
  it('the way down differs only where the table says', () => {
    expect(maqamChart('rast').down![1].name).toBe('B♭');
    expect(maqamChart('nahawand').down![1].name).toBe('B♭');
    expect(maqamChart('kurd').down).toBeNull();
  });
});

describe('chords', () => {
  it('reads G, Am and D', () => {
    expect(triad('G').notes).toEqual(['G', 'B', 'D']);
    expect(triad('Am').notes).toEqual(['A', 'C', 'E']);
    expect(triad('D').notes).toEqual(['D', 'F♯', 'A']);
  });
  it('finds the key from the chords', () => {
    expect(keyChords('G')).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em']);
    expect(keysForChords(['G', 'C', 'D', 'Am'])).toEqual(['G']);
  });
});
