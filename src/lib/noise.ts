// Room noise check: ~3 s of the room's loudness (relative RMS, not calibrated dB) before mic exercises,
// and a voice-detection threshold that adapts to it.

import { getPref, setPref } from './storage';
import { median } from './stats';

export type NoiseLevel = 'quiet' | 'ok' | 'noisy';

/** Thresholds on the median RMS of a quiet room recording (the phone mic, browser processing off). */
export function noiseLevel(rms: number): NoiseLevel {
  if (rms < 0.004) return 'quiet';
  if (rms < 0.012) return 'ok';
  return 'noisy';
}

/** The room's level from loudness readings: the median (ignores a short cough or click). */
export function roomLevel(rmsValues: number[]): number {
  return rmsValues.length ? median(rmsValues) : 0;
}

/** "She's making sound" when louder than this: 3× the room, kept between sensible limits. */
export function voiceThreshold(noiseRms: number | null): number {
  if (noiseRms === null || !Number.isFinite(noiseRms)) return 0.01;
  return Math.max(0.008, Math.min(0.06, noiseRms * 3));
}

// ---- saved setting

export function savedNoise(): number | null {
  const v = Number(getPref('noise.rms'));
  return getPref('noise.rms') && Number.isFinite(v) ? v : null;
}

export function saveNoise(rms: number) {
  setPref('noise.rms', String(rms));
}

/** The threshold the exercises use now. */
export function currentVoiceThreshold(): number {
  return voiceThreshold(savedNoise());
}

export const noiseCheckOn = () => getPref('noise.check') !== 'off';
export const setNoiseCheck = (on: boolean) => setPref('noise.check', on ? 'on' : 'off');
