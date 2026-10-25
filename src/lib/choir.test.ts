import { describe, expect, it } from 'vitest';
import { mixGains, modeGains, partKey, partOctave, songIdOfKey, syncTarget } from './choir';
import { scoreRepeat } from './loop';
import { midiToFreq } from './music';
import type { PitchPoint } from './compare';

describe('choir modes', () => {
  it('her part alone / loud / muted', () => {
    expect(modeGains('mine', 4, 1)).toEqual([0, 1, 0, 0]);
    expect(modeGains('mineLoud', 4, 1)).toEqual([0.25, 1, 0.25, 0.25]);
    expect(modeGains('withoutMe', 4, 1)).toEqual([1, 0, 1, 1]);
  });
  it('fade: her part gets quieter each repeat until it is gone', () => {
    expect([0, 1, 2, 3, 4, 5].map((r) => modeGains('fade', 3, 0, r)[0])).toEqual([1, 0.75, 0.5, 0.25, 0, 0]);
    expect(modeGains('fade', 3, 0, 4)[1]).toBe(1);
  });
  it('her sliders and mute buttons act on top of the mode', () => {
    expect(mixGains([1, 0.25, 1], [0.5, 1, 1], [false, false, true])).toEqual([0.5, 0.25, 0]);
  });
});

describe('sync and part storage', () => {
  it('a follower that drifts more than 40 ms jumps back to the leader', () => {
    expect(syncTarget(10, 10.02)).toBeNull();
    expect(syncTarget(10, 10.08)).toBe(10);
    expect(syncTarget(10, 9.9)).toBe(10);
  });
  it('part audio is keyed song::part, so the backup knows which song it belongs to', () => {
    expect(partKey('s1', 'p2')).toBe('s1::p2');
    expect(songIdOfKey('s1::p2')).toBe('s1');
    expect(songIdOfKey('s1')).toBe('s1');
  });
});

describe('scoring her part', () => {
  const part: PitchPoint[] = Array.from({ length: 200 }, (_, i) => ({ t: i * 0.02, freq: midiToFreq(i < 100 ? 64 : 67) }));
  it('scores against her own part, octave-insensitive, and reports the octave she sings in', () => {
    const lowerOctave = part.map((p) => ({ t: p.t, freq: p.freq! / 2 }));
    expect(scoreRepeat(lowerOctave, part, { start: 0, end: 4 })).toBe(100);
    expect(partOctave(lowerOctave, part)).toBe(-1);
    expect(partOctave(part, part)).toBe(0);
    expect(partOctave([], part)).toBeNull();
    const other = part.map((p) => ({ t: p.t, freq: midiToFreq(60) })); // singing another part's line
    expect(scoreRepeat(other, part, { start: 0, end: 4 })).toBeLessThan(10);
  });
});
