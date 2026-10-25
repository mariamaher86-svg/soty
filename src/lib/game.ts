// "🎮 لعبة الصوت": a bird whose height follows her pitch (mapped to her range); tubes ("gates") come from the
// right and she sings into them. Silence = the bird glides down gently (it never dies).

import { MAQAMAT } from './maqam';

export interface Gate {
  /** seconds from the start when the gate reaches the bird */
  t: number;
  dur: number;
  /** target note (MIDI, quarter tones allowed) */
  midi: number;
}

export interface GameLevel {
  id: 1 | 2 | 3;
  ar: string;
  /** how close counts as inside, cents */
  tolerance: number;
  /** px per second the gates move */
  speed: number;
}

export const GAME_LEVELS: GameLevel[] = [
  { id: 1, ar: 'نغمات لوحدها ببطء', tolerance: 60, speed: 90 },
  { id: 2, ar: 'دو ري مي', tolerance: 45, speed: 110 },
  { id: 3, ar: 'جمل مقامات بالربع تون', tolerance: 35, speed: 120 },
];

/** Her note → height on the canvas: her low note near the bottom, her high note near the top. */
export function midiToY(midi: number, low: number, high: number, height: number, pad = 0.12): number {
  const span = Math.max(1, high - low);
  const f = Math.max(0, Math.min(1, (midi - low) / span));
  return height * (1 - pad) - f * height * (1 - 2 * pad);
}

/** Bird height for the next frame: eases toward her note; with no voice it glides down slowly to the ground. */
export function stepBird(y: number, targetY: number | null, dt: number, height: number, glide = 60): number {
  if (targetY === null) return Math.min(height * 0.95, y + glide * dt);
  const k = 1 - Math.exp(-dt * 14); // ~70 ms to catch up: smooth but responsive
  return y + (targetY - y) * k;
}

/** Inside the gate: within `tolerance` cents of its note (octave matters — the gates are in her range). */
export function inGate(birdMidi: number | null, gateMidi: number, tolerance: number): boolean {
  return birdMidi !== null && Math.abs(birdMidi - gateMidi) * 100 <= tolerance;
}

/** Points for one gate from the time she spent inside it. */
export function gatePoints(insideSeconds: number, dur: number): number {
  return dur > 0 ? Math.round(Math.max(0, Math.min(1, insideSeconds / dur)) * 100) : 0;
}

export function courseScore(points: number[]): { points: number; percent: number } {
  const total = points.reduce((a, b) => a + b, 0);
  return { points: total, percent: points.length ? Math.round(total / points.length) : 0 };
}

/** Tiny seeded random (same course for the same seed). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * The gates for a level in her range. `tonic` = a comfortable C/do in her voice (MIDI).
 * 1: single notes with long gaps; 2: do-re-mi up and down; 3: maqam phrases (Rast, Bayati) with quarter tones.
 */
export function makeCourse(level: 1 | 2 | 3, low: number, high: number, tonic: number, seed = 1): Gate[] {
  const r = rng(seed);
  const out: Gate[] = [];
  let t = 3; // a few seconds to get ready
  const fit = (m: number) => {
    let x = m;
    while (x > high) x -= 12;
    while (x < low) x += 12;
    return x;
  };
  if (level === 1) {
    for (let i = 0; i < 10; i++) {
      const m = Math.round(low + 2 + r() * Math.max(1, high - low - 4));
      out.push({ t, dur: 2, midi: m });
      t += 4;
    }
  } else if (level === 2) {
    const steps = [0, 2, 4, 5, 7, 5, 4, 2, 0, 4, 7, 4, 0];
    for (const s of steps) {
      out.push({ t, dur: 1.2, midi: fit(tonic + s) });
      t += 1.8;
    }
  } else {
    for (const id of ['rast', 'bayati']) {
      const m = MAQAMAT.find((x) => x.id === id)!;
      const base = id === 'rast' ? tonic : tonic + 2;
      const deg = m.up.slice(0, 5).map((c) => c / 100);
      for (const d of [...deg, ...deg.slice(0, -1).reverse()]) {
        out.push({ t, dur: 1, midi: fit(base + d) });
        t += 1.5;
      }
      t += 2; // breath between phrases
    }
  }
  return out;
}

/** The course length in seconds (last gate end + a moment). */
export const courseLength = (gates: Gate[]) => (gates.length ? gates[gates.length - 1].t + gates[gates.length - 1].dur + 1.5 : 0);
