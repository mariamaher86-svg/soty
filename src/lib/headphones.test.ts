import { describe, expect, it } from 'vitest';
import { resultsReliable, speakerHeard, TEST_TONE_HZ } from './headphones';
import { micConstraints } from '../audio/audio';

describe('headphones check', () => {
  it('the speaker is detected when the mic hears the test tone (octave slips too)', () => {
    expect(speakerHeard(Array.from({ length: 20 }, () => ({ freq: TEST_TONE_HZ })))).toBe(true);
    expect(speakerHeard(Array.from({ length: 20 }, (_, i) => ({ freq: i % 2 ? TEST_TONE_HZ / 2 : null })))).toBe(true);
  });
  it('silence, her voice or a few stray frames are not the speaker', () => {
    expect(speakerHeard(Array.from({ length: 20 }, () => ({ freq: null })))).toBe(false);
    expect(speakerHeard(Array.from({ length: 20 }, () => ({ freq: 220 })))).toBe(false);
    expect(speakerHeard(Array.from({ length: 20 }, (_, i) => ({ freq: i < 3 ? TEST_TONE_HZ : null })))).toBe(false);
    expect(speakerHeard([{ freq: TEST_TONE_HZ }])).toBe(false); // too little to tell
  });
  it('results are unreliable only when she sang on the speaker', () => {
    expect(resultsReliable(null)).toBe(true);
    expect(resultsReliable('headphones')).toBe(true);
    expect(resultsReliable('speaker')).toBe(false);
    expect(resultsReliable('speaker-ok')).toBe(false);
  });
  it('echo cancellation only while music plays; exercises keep the raw sound', () => {
    expect(micConstraints({ echoCancel: true })).toEqual({ echoCancellation: true, noiseSuppression: true, autoGainControl: false });
    expect(micConstraints()).toEqual({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  });
});
