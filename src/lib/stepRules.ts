// "Did this step really happen?" — the rules behind the guided flows' next buttons.
// A step's main "next" is enabled only with a real result; "تخطي الخطوة" moves on and saves nothing.

export const MIN_MATCH_TRIES = { measure: 5, workout: 3 };

/** Range test: a low and a high note at least 3 semitones apart. */
export function rangeIsReal(low: number | null | undefined, high: number | null | undefined): boolean {
  return low != null && high != null && high - low >= 3;
}

/** Pitch matching: enough attempts, and she actually sang (there is an average deviation). */
export function matchIsReal(tries: number, avgCents: number | null, minTries: number): boolean {
  return tries >= minTries && avgCents !== null;
}

/** Sustain / ssss: at least 1 second of detected sound. */
export function secondsIsReal(seconds: number | null | undefined): boolean {
  return seconds != null && seconds >= 1;
}

/** Stability: a finished 5-second measurement. */
export function stabilityIsReal(sdCents: number | null | undefined): boolean {
  return sdCents != null && Number.isFinite(sdCents);
}

/** Maqam: at least one degree really sung (all skipped = 0%). */
export function maqamIsReal(percentOk: number | null | undefined): boolean {
  return percentOk != null && percentOk > 0;
}

/** Ear training: a few answered questions (listening only, so answering is the work). */
export function earIsReal(answered: number): boolean {
  return answered >= 3;
}

/** Rhythm: one finished clapping round where at least one clap was heard on a beat. */
export function rhythmIsReal(score: number | null | undefined): boolean {
  return score != null && score > 0;
}

/** Interval singing: one success, or several real attempts. */
export function intervalsIsReal(right: number, total: number): boolean {
  return right >= 1 || total >= 5;
}

// warm-up parts
export function trillIsReal(soundingSeconds: number): boolean {
  return soundingSeconds >= 5;
}
export function sirenIsReal(voicedShare: number, seconds: number): boolean {
  return voicedShare >= 0.25 && seconds >= 10;
}
export function humIsReal(results: (number | null | undefined)[]): boolean {
  return results.filter((r) => r != null).length >= 2;
}
/** The warm-up counts when at least 2 of its 3 parts really happened. */
export function warmupIsReal(partsDone: number): boolean {
  return partsDone >= 2;
}

/** A workout counts (streak, "done today") when at least half of its steps had real results. */
export function workoutCounts(doneSteps: number, totalSteps: number): boolean {
  return totalSteps > 0 && doneSteps >= Math.ceil(totalSteps / 2);
}
