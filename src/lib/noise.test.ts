import { describe, expect, it } from 'vitest';
import { noiseLevel, roomLevel, voiceThreshold } from './noise';
import { noiseThreshold } from './warmup';

describe('room noise check', () => {
  it('classifies the room level', () => {
    expect(noiseLevel(0.002)).toBe('quiet');
    expect(noiseLevel(0.008)).toBe('ok');
    expect(noiseLevel(0.03)).toBe('noisy');
  });
  it('uses the median, so a short cough does not count', () => {
    expect(roomLevel([0.003, 0.003, 0.004, 0.2, 0.003])).toBeCloseTo(0.003);
    expect(roomLevel([])).toBe(0);
  });
  it('voice threshold = 3× the room, within sensible limits', () => {
    expect(voiceThreshold(null)).toBe(0.01); // no check done: the old default
    expect(voiceThreshold(0.001)).toBe(0.008); // very quiet room: not oversensitive
    expect(voiceThreshold(0.01)).toBeCloseTo(0.03);
    expect(voiceThreshold(0.5)).toBe(0.06); // very noisy: capped so a voice can still count
  });
  it('the lip-trill threshold only gets stricter with a noisy room', () => {
    const take = [0.002, 0.002, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    expect(noiseThreshold(take)).toBe(0.015);
    expect(noiseThreshold(take, 0.02)).toBeCloseTo(0.06);
    expect(noiseThreshold(take, 0.001)).toBe(0.015);
  });
});
