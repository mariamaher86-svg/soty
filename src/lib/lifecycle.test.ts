import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextAction, installLifecycle, Lifecycle, lifecycle } from './lifecycle';

describe('what to do with the AudioContext on a tap', () => {
  it('running → keep; closed/interrupted → new one; suspended → resume, or a new one after the background', () => {
    expect(contextAction(null, false)).toBe('create');
    expect(contextAction('running', true)).toBe('keep');
    expect(contextAction('closed', false)).toBe('recreate');
    expect(contextAction('interrupted', false)).toBe('recreate');
    expect(contextAction('suspended', false)).toBe('resume'); // first tap ever
    expect(contextAction('suspended', true)).toBe('recreate'); // back from the background: resume() may hang on iOS
  });
});

describe('hidden / visible', () => {
  it('remembers whether something was busy, tells everyone, and clears stale busy flags', () => {
    const lc = new Lifecycle();
    const stops: string[] = [];
    lc.onHidden(() => stops.push('mic'));
    lc.onHidden(() => stops.push('metronome'));
    const shows: { wasBusy: boolean; awayMs: number }[] = [];
    lc.onVisible((i) => shows.push(i));
    lc.setBusy('mic', true);
    lc.hide(1000);
    expect(stops).toEqual(['mic', 'metronome']);
    expect(lc.isBusy()).toBe(false); // nothing left "listening" after coming back
    expect(lc.audioStale).toBe(true);
    lc.show(61000);
    expect(shows).toEqual([{ wasBusy: true, awayMs: 60000 }]);
    // idle when hidden → nothing to reset
    lc.hide(70000);
    lc.show(71000);
    expect(shows[1].wasBusy).toBe(false);
  });
  it('hide/show twice in a row count once; a failing listener does not stop the others', () => {
    const lc = new Lifecycle();
    let n = 0;
    lc.onHidden(() => {
      throw new Error('boom');
    });
    lc.onHidden(() => n++);
    lc.hide();
    lc.hide();
    expect(n).toBe(1);
    const off = lc.onVisible(() => n++);
    lc.show();
    lc.show();
    expect(n).toBe(2);
    off();
    lc.hide();
    lc.show();
    expect(n).toBe(3);
  });
  it('busy counts nest and never go negative', () => {
    const lc = new Lifecycle();
    lc.setBusy('note', true);
    lc.setBusy('note', true);
    lc.setBusy('note', false);
    expect(lc.isBusy()).toBe(true);
    lc.setBusy('note', false);
    lc.setBusy('note', false);
    expect(lc.isBusy()).toBe(false);
    lc.setBusy('note', true);
    expect(lc.isBusy()).toBe(true);
  });
  it('page events: visibilitychange, pagehide, and a pageshow from the back-forward cache', () => {
    const lc = new Lifecycle();
    const win = new EventTarget() as unknown as Window;
    let state: DocumentVisibilityState = 'visible';
    const doc = new EventTarget() as unknown as Document;
    Object.defineProperty(doc, 'visibilityState', { get: () => state });
    installLifecycle(lc, win, doc);
    const log: string[] = [];
    lc.onHidden(() => log.push('hidden'));
    lc.onVisible(() => log.push('visible'));
    state = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    state = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pagehide'));
    const show = Object.assign(new Event('pageshow'), { persisted: true });
    win.dispatchEvent(show);
    expect(log).toEqual(['hidden', 'visible', 'hidden', 'visible']);
  });
});

/** A fake AudioContext whose resume() can hang forever, like iOS after the app was in the background. */
class FakeContext {
  static made: FakeContext[] = [];
  static resumeHangs = false;
  state: string = 'suspended';
  closed = false;
  currentTime = 0;
  destination = {};
  constructor() {
    FakeContext.made.push(this);
  }
  resume() {
    if (FakeContext.resumeHangs) return new Promise<void>(() => {});
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { connect() {}, start() {} };
  }
}

describe('the AudioContext comes back after the app was in the background', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeContext.made = [];
    FakeContext.resumeHangs = false;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('first tap resumes; after the background a stuck context is replaced on the next tap', async () => {
    const { checkAudioOnTap, onContextChange } = await import('../audio/audio');
    const { lifecycle: lc } = await import('./lifecycle');
    const first = checkAudioOnTap() as unknown as FakeContext;
    await Promise.resolve();
    expect(first.state).toBe('running');
    let changed = 0;
    onContextChange(() => changed++);

    // she leaves the app: iOS interrupts the context and resume() never finishes any more
    lc.hide();
    first.state = 'interrupted';
    FakeContext.resumeHangs = true;
    lc.show();

    const next = checkAudioOnTap() as unknown as FakeContext;
    expect(next).not.toBe(first);
    expect(first.closed).toBe(true);
    expect(changed).toBe(1);
    expect(FakeContext.made).toHaveLength(2);
  });

  it('"suspended" after the background is replaced too, and a resume that never takes is replaced on the tap after', async () => {
    const { checkAudioOnTap } = await import('../audio/audio');
    const { lifecycle: lc } = await import('./lifecycle');
    const a = checkAudioOnTap() as unknown as FakeContext; // created
    lc.hide();
    lc.show();
    a.state = 'suspended';
    const b = checkAudioOnTap() as unknown as FakeContext;
    expect(b).not.toBe(a);
    // a context that is suspended without a background visit is resumed… but if that hangs, the next tap replaces it
    FakeContext.resumeHangs = true;
    b.state = 'suspended';
    expect(checkAudioOnTap()).toBe(b as unknown as AudioContext);
    vi.advanceTimersByTime(900);
    const c = checkAudioOnTap() as unknown as FakeContext;
    expect(c).not.toBe(b);
  });

  it('a closed context is never handed out', async () => {
    const { audioContext } = await import('../audio/audio');
    const a = audioContext() as unknown as FakeContext;
    a.state = 'closed';
    expect(audioContext()).not.toBe(a as unknown as AudioContext);
  });

  it('waiting on a note never hangs, even if the audio never ends', async () => {
    const { settleWithin } = await import('../audio/audio');
    const done = vi.fn();
    void settleWithin(new Promise(() => {}), 2000).then(done);
    vi.advanceTimersByTime(1999);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(done).toHaveBeenCalledWith(undefined);
  });
});

it('the shared lifecycle exists for the app', () => {
  expect(lifecycle).toBeInstanceOf(Lifecycle);
});
