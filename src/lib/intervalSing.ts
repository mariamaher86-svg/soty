// Interval singing ("الفواصل"): she hears a note and sings an interval above (later below) it.

import { everPassed } from './ear';
import { centsBetween, midiToFreq, shiftCents, wrapOctave } from './music';

export interface SingInterval {
  cents: number;
  ar: string;
  en: string;
  /** A familiar public-domain tune that starts with this jump (name only, no lyrics). */
  tune?: string;
}

export const SING_INTERVALS: SingInterval[] = [
  { cents: 0, ar: 'نفس النغمة', en: 'Unison' },
  { cents: 100, ar: 'تانية صغيرة', en: 'Minor 2nd', tune: 'زي أول نغمتين في "Für Elise" لبيتهوفن (نازلة)' },
  { cents: 150, ar: 'تانية ¾ (ربع تون)', en: 'Neutral 2nd', tune: 'زي أول خطوة في مقام بياتي' },
  { cents: 200, ar: 'تانية كبيرة', en: 'Major 2nd', tune: 'زي أول "دو ري" في "Frère Jacques"' },
  { cents: 300, ar: 'تالتة صغيرة', en: 'Minor 3rd', tune: 'زي أول نغمتين في "Greensleeves"' },
  { cents: 350, ar: 'تالتة ¾ (ربع تون)', en: 'Neutral 3rd', tune: 'زي تالتة مقام راست' },
  { cents: 400, ar: 'تالتة كبيرة', en: 'Major 3rd', tune: 'زي أول نغمتين في "When the Saints Go Marching In"' },
  { cents: 500, ar: 'رابعة تامة', en: 'Perfect 4th', tune: 'زي أول نغمتين في "Here Comes the Bride" (مارش الفرح)' },
  { cents: 700, ar: 'خامسة تامة', en: 'Perfect 5th', tune: 'زي أول "Twinkle Twinkle Little Star" (النغمة التالتة)' },
  { cents: 800, ar: 'سادسة صغيرة', en: 'Minor 6th' },
  { cents: 900, ar: 'سادسة كبيرة', en: 'Major 6th', tune: 'زي أول نغمتين في "My Bonnie Lies over the Ocean"' },
  { cents: 1200, ar: 'أوكتاف', en: 'Octave' },
];

export const intervalInfo = (cents: number) => SING_INTERVALS.find((i) => i.cents === cents)!;

export interface IntervalLevel {
  n: number;
  ar: string;
  cents: number[];
  down: boolean;
}

/** Levels unlock like ear training (8 of the last 10). The last one has Arabic three-quarter tones. */
export const INTERVAL_LEVELS: IntervalLevel[] = [
  { n: 1, ar: 'نفس النغمة، خامسة، أوكتاف (لفوق)', cents: [0, 700, 1200], down: false },
  { n: 2, ar: '+ التالتات والرابعة (لفوق)', cents: [0, 300, 400, 500, 700, 1200], down: false },
  { n: 3, ar: '+ التانيات والسادسات (لفوق)', cents: [100, 200, 300, 400, 500, 700, 800, 900, 1200], down: false },
  { n: 4, ar: 'لفوق ولتحت', cents: [100, 200, 300, 400, 500, 700, 800, 900, 1200], down: true },
  { n: 5, ar: 'ربع تون: تانية ¾ وتالتة ¾ (راست/بياتي)', cents: [150, 200, 300, 350, 400], down: false },
];

/** The frequency she should sing. */
export function intervalTarget(refFreq: number, cents: number, down: boolean): number {
  return shiftCents(refFreq, down ? -cents : cents);
}

/** Deviation in cents from the target; octave-insensitive only for unison and octave. */
export function intervalDeviation(sung: number, target: number, cents: number): number {
  const d = centsBetween(sung, target);
  return cents % 1200 === 0 ? wrapOctave(d) : d;
}

export function isLevelOpen(index: number, histories: boolean[][]): boolean {
  if (index <= 0) return true;
  return isLevelOpen(index - 1, histories) && everPassed(histories[index - 1] ?? []);
}

/** First level not passed yet (or the last one). */
export function currentIntervalLevel(histories: boolean[][]): number {
  for (let i = 0; i < INTERVAL_LEVELS.length; i++) if (!everPassed(histories[i] ?? [])) return i;
  return INTERVAL_LEVELS.length - 1;
}

export interface IntervalTask {
  refMidi: number;
  refFreq: number;
  cents: number;
  down: boolean;
  target: number;
}

/** A task inside [low, high] (MIDI): both the reference and the target note fit her range. */
export function makeIntervalTask(levelIndex: number, low: number, high: number, rng: () => number = Math.random): IntervalTask {
  const level = INTERVAL_LEVELS[levelIndex];
  const span = high - low;
  const fits = level.cents.filter((c) => Math.ceil(c / 100) <= span);
  const cents = fits.length ? fits[Math.floor(rng() * fits.length)] : 0;
  const down = level.down && cents > 0 && rng() < 0.5;
  const semis = Math.ceil(cents / 100);
  const lo = down ? low + semis : low;
  const hi = down ? high : high - semis;
  const refMidi = lo + Math.floor(rng() * (Math.max(lo, hi) - lo + 1));
  const refFreq = midiToFreq(refMidi);
  return { refMidi, refFreq, cents, down, target: intervalTarget(refFreq, cents, down) };
}
