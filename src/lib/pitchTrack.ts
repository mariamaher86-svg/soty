// Extracting a pitch curve from recorded/loaded audio samples (runs in the browser).

import { PitchDetector } from 'pitchy';
import type { PitchPoint } from './compare';
import { median } from './stats';

export interface TrackOptions {
  windowSize?: number;
  hopSeconds?: number;
  minClarity?: number;
  minFreq?: number;
  maxFreq?: number;
  /** Ignore frames quieter than this RMS. */
  minRms?: number;
}

/** Pitch of one frame, or null if unvoiced/unclear. */
export function framePitch(detector: PitchDetector<Float32Array>, frame: Float32Array, sampleRate: number, o: Required<TrackOptions>): number | null {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  if (Math.sqrt(sum / frame.length) < o.minRms) return null;
  const [freq, clarity] = detector.findPitch(frame, sampleRate);
  if (clarity < o.minClarity || freq < o.minFreq || freq > o.maxFreq) return null;
  return freq;
}

/**
 * Pitch curve of mono samples. Async and chunked so the page stays responsive;
 * onProgress gets 0..1.
 */
export async function extractPitchCurve(samples: Float32Array, sampleRate: number, options: TrackOptions = {}, onProgress?: (p: number) => void): Promise<PitchPoint[]> {
  const o: Required<TrackOptions> = { windowSize: 2048, hopSeconds: 0.02, minClarity: 0.85, minFreq: 60, maxFreq: 1400, minRms: 0.01, ...options };
  const detector = PitchDetector.forFloat32Array(o.windowSize);
  const hop = Math.max(1, Math.round(o.hopSeconds * sampleRate));
  const out: PitchPoint[] = [];
  let lastYield = performance.now();
  for (let start = 0; start + o.windowSize <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + o.windowSize);
    out.push({ t: (start + o.windowSize / 2) / sampleRate, freq: framePitch(detector, frame, sampleRate, o) });
    if (performance.now() - lastYield > 30) {
      onProgress?.(start / samples.length);
      await new Promise((r) => setTimeout(r, 0));
      lastYield = performance.now();
    }
  }
  onProgress?.(1);
  return smoothCurve(out);
}

/** Median-filter voiced runs (removes single-frame octave jumps) and drop tiny voiced blips. */
export function smoothCurve(curve: PitchPoint[], radius = 2, minRun = 3): PitchPoint[] {
  const res = curve.map((p, i) => {
    if (!p.freq) return p;
    const near: number[] = [];
    for (let j = Math.max(0, i - radius); j <= Math.min(curve.length - 1, i + radius); j++) {
      const f = curve[j].freq;
      if (f) near.push(f);
    }
    return { t: p.t, freq: median(near) };
  });
  // remove voiced runs shorter than minRun frames
  let i = 0;
  while (i < res.length) {
    if (!res[i].freq) {
      i++;
      continue;
    }
    let j = i;
    while (j < res.length && res[j].freq) j++;
    if (j - i < minRun) for (let k = i; k < j; k++) res[k] = { t: res[k].t, freq: null };
    i = j;
  }
  return res;
}

/** Mix all channels of an AudioBuffer to mono. */
export function toMono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buffer.numberOfChannels;
  }
  return out;
}
