import { vi } from 'vitest';

// Which test is running (page tests). When a test times out, vitest moves on, but that test is still inside a long
// fake-time advance (seconds of mic frames) within React's act(). While that act() stays open, the next tests' renders
// are queued inside it and their pages stay empty: one slow test became a dozen failures. Every wait in the helpers
// advances time in small slices and checks this number, so a test that ended stops within one slice, its act()
// closes, and each test only ever touches its own state.

let current = 0;
/** waits (and their act() scopes) still running, from any test */
let open = 0;

/** setup.ts: a test ends (afterEach) or starts (beforeEach). */
export function nextTest() {
  current++;
}

/** Fake time for the current test, in slices, stopping at once if the test ended meanwhile. */
export async function advance(ms: number, slice = 50) {
  const id = current;
  let left = ms;
  open++;
  try {
    do {
      stillMine(id);
      const step = Math.min(left, slice);
      await vi.advanceTimersByTimeAsync(step);
      left -= step;
    } while (left > 0);
    stillMine(id);
  } finally {
    open--;
  }
}

/**
 * setup.ts, before a test: let a timed-out test's leftover wait reach its next slice, throw and close its act() scope,
 * so nothing of it is still open when this test renders (real time; at most a couple of seconds).
 */
export async function settleLeftovers(maxMs = 3000) {
  const end = Date.now() + maxMs;
  while (open > 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 5));
}

/** Throws when the test that started a wait has ended meanwhile (it timed out). */
export function stillMine(id: number) {
  if (id !== current) throw new Error('this test already ended (it timed out) — stopped so it cannot touch the next test');
}

/** Runs a wait for the current test and stops it afterwards if the test ended meanwhile. */
export async function guarded<T>(wait: () => Promise<T>): Promise<T> {
  const id = current;
  open++;
  try {
    const r = await wait();
    stillMine(id);
    return r;
  } finally {
    open--;
  }
}
