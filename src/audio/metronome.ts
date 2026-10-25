// Metronome clicks scheduled ahead on the AudioContext clock (steady even if the page is busy).

import { audioContext } from './audio';
import { scheduleBeats, type ScheduledBeat } from '../lib/rhythm';

const LOOKAHEAD = 0.12; // s scheduled ahead
const TICK_MS = 25;

/** One short click at `time` (AudioContext seconds); beat 1 is higher and louder. */
export function click(time: number, accent: boolean, volume = 1) {
  const ac = audioContext();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime((accent ? 0.6 : 0.35) * volume, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(gain).connect(ac.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

export interface Metronome {
  /** AudioContext time of beat 0 */
  start: number;
  stop: () => void;
}

/**
 * Starts clicking at `bpm` from `delay` s from now. `onBeat` runs (roughly on time) for each beat; `audible(index)`
 * can silence some beats (e.g. after the count-in). `maxBeats` stops by itself.
 */
export function startMetronome(opts: { bpm: number; beatsPerBar: number; delay?: number; maxBeats?: number; audible?: (index: number) => boolean; onBeat?: (b: ScheduledBeat) => void; onEnd?: () => void }): Metronome {
  const ac = audioContext();
  const start = ac.currentTime + (opts.delay ?? 0.3);
  let next = start;
  let index = 0;
  const timers: number[] = [];
  let ended = false;
  const tick = () => {
    const r = scheduleBeats(next, index, ac.currentTime, LOOKAHEAD, opts.bpm, opts.beatsPerBar);
    for (const b of r.beats) {
      if (opts.maxBeats !== undefined && b.index >= opts.maxBeats) {
        if (!ended) {
          ended = true;
          timers.push(window.setTimeout(() => opts.onEnd?.(), Math.max(0, (b.time - ac.currentTime) * 1000)));
        }
        clearInterval(interval);
        return;
      }
      if (opts.audible?.(b.index) ?? true) click(b.time, b.accent);
      if (opts.onBeat) timers.push(window.setTimeout(() => opts.onBeat!(b), Math.max(0, (b.time - ac.currentTime) * 1000)));
    }
    next = r.nextTime;
    index = r.nextIndex;
  };
  const interval = window.setInterval(tick, TICK_MS);
  tick();
  return {
    start,
    stop: () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    },
  };
}
