import { describe, expect, it } from 'vitest';
import { chooseTonic, MAQAMAT, maqamSequence } from './maqam';
import { centsBetween, midiToFreq } from './music';

const byId = (id: string) => MAQAMAT.find((m) => m.id === id)!;

describe('maqam degree frequencies', () => {
  it('Rast on C4 has half-flat 3rd and 7th (not snapped to 12-TET)', () => {
    const c4 = midiToFreq(60);
    const seq = maqamSequence(byId('rast'), c4, 'up');
    expect(seq).toHaveLength(8);
    // E half-flat = 350 cents above C, exactly between E♭ and E
    expect(centsBetween(seq[2].freq, c4)).toBeCloseTo(350);
    expect(centsBetween(seq[2].freq, midiToFreq(64))).toBeCloseTo(-50);
    expect(centsBetween(seq[6].freq, c4)).toBeCloseTo(1050);
    expect(seq[7].freq).toBeCloseTo(c4 * 2);
  });

  it('Bayati 2nd is a three-quarter tone above the tonic', () => {
    const d4 = midiToFreq(62);
    const seq = maqamSequence(byId('bayati'), d4, 'up');
    expect(centsBetween(seq[1].freq, d4)).toBeCloseTo(150);
    expect(seq[1].freq).toBeCloseTo(d4 * Math.pow(2, 150 / 1200));
  });

  it('Hijaz has the augmented second between 2nd and 3rd', () => {
    const seq = maqamSequence(byId('hijaz'), 293.66, 'up');
    expect(centsBetween(seq[2].freq, seq[1].freq)).toBeCloseTo(300);
  });

  it('descending uses the descending form and ends on the tonic', () => {
    const c4 = midiToFreq(60);
    const down = maqamSequence(byId('rast'), c4, 'down');
    expect(down[0].freq).toBeCloseTo(c4 * 2);
    expect(centsBetween(down[1].freq, c4)).toBeCloseTo(1000); // B♭ on the way down
    expect(down[7].freq).toBeCloseTo(c4);
  });

  it('both = up then down without repeating the top note', () => {
    const seq = maqamSequence(byId('ajam'), 440, 'both');
    expect(seq).toHaveLength(15);
    expect(seq[7].freq).toBeCloseTo(880);
    expect(seq[8].cents).toBe(1100);
    expect(seq[14].freq).toBeCloseTo(440);
  });

  it('every maqam has 8 ascending degrees starting at 0', () => {
    for (const m of MAQAMAT) {
      expect(m.up).toHaveLength(8);
      expect(m.up[0]).toBe(0);
      if (m.down) expect(m.down).toHaveLength(8);
    }
  });
});

describe('chooseTonic', () => {
  it('fits the octave inside the range', () => {
    const t = chooseTonic(55, 74);
    expect(t).toBeGreaterThanOrEqual(55);
    expect(t + 12).toBeLessThanOrEqual(74);
  });
  it('falls back to the lowest note for small ranges', () => {
    expect(chooseTonic(57, 65)).toBe(57);
  });
});
