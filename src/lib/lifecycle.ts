// App lifecycle on iPhone: leaving the app (home screen, lock, a call, another audio app) freezes the page and
// iOS takes the audio and the mic away. Coming back, an old AudioContext can stay "interrupted"/"suspended" with a
// resume() that never finishes, and mic tracks are ended — so everything looks frozen.
// One place handles it for every feature:
//   hidden  → listeners stop everything (mics, metronome, choir…), and we remember whether something was busy
//   visible → listeners decide what to reset (the app remounts the page if something was busy)
//   next tap → the AudioContext is resumed, or replaced by a fresh one (see contextAction)

export type CtxState = AudioContextState | 'interrupted' | null;
export type CtxAction = 'create' | 'keep' | 'resume' | 'recreate';

/**
 * What to do with the AudioContext on a tap. A context that isn't running after the app was in the background
 * (or is "interrupted"/"closed") is replaced: on iOS its resume() can hang forever, and a new one made inside the
 * tap starts right away. A plain "suspended" one that was never backgrounded (first tap) is just resumed.
 */
export function contextAction(state: CtxState, backgroundedSinceLastTap: boolean): CtxAction {
  if (state === null) return 'create';
  if (state === 'running') return 'keep';
  if (state === 'closed' || state === 'interrupted') return 'recreate';
  return backgroundedSinceLastTap ? 'recreate' : 'resume';
}

export interface ShowInfo {
  /** something was playing / listening / running when the app was left */
  wasBusy: boolean;
  awayMs: number;
}

export class Lifecycle {
  hidden = false;
  /** the app was in the background since the audio was last checked on a tap */
  audioStale = false;
  private hiddenAt = 0;
  private busyAtHide = false;
  private busy = new Map<string, number>();
  private hideSubs = new Set<() => void>();
  private showSubs = new Set<(i: ShowInfo) => void>();

  /** a feature says it's busy (mic listening, note playing, metronome running…) or done */
  setBusy(id: string, on: boolean) {
    const n = (this.busy.get(id) ?? 0) + (on ? 1 : -1);
    if (n > 0) this.busy.set(id, n);
    else this.busy.delete(id);
  }

  isBusy(): boolean {
    return this.busy.size > 0;
  }

  busyNames(): string[] {
    return [...this.busy.keys()];
  }

  onHidden(cb: () => void): () => void {
    this.hideSubs.add(cb);
    return () => void this.hideSubs.delete(cb);
  }

  onVisible(cb: (i: ShowInfo) => void): () => void {
    this.showSubs.add(cb);
    return () => void this.showSubs.delete(cb);
  }

  hide(now = Date.now()) {
    if (this.hidden) return;
    this.hidden = true;
    this.hiddenAt = now;
    this.busyAtHide = this.isBusy();
    this.audioStale = true;
    for (const cb of [...this.hideSubs]) safe(cb);
    // whatever didn't release itself is not busy any more: the page is reset on return if it was
    this.busy.clear();
  }

  show(now = Date.now()) {
    if (!this.hidden) return;
    this.hidden = false;
    const info = { wasBusy: this.busyAtHide, awayMs: now - this.hiddenAt };
    this.busyAtHide = false;
    for (const cb of [...this.showSubs]) safe(() => cb(info));
  }

  /** the audio was checked (resumed or replaced) inside a tap */
  audioChecked() {
    this.audioStale = false;
  }
}

function safe(f: () => void) {
  try {
    f();
  } catch {
    // one feature failing to stop must not keep the others running
  }
}

export const lifecycle = new Lifecycle();

/** Wire the page events once: visibilitychange, pagehide/pageshow (iOS back-forward cache), freeze/resume. */
export function installLifecycle(lc: Lifecycle = lifecycle, win: Window = window, doc: Document = document) {
  const sync = () => (doc.visibilityState === 'hidden' ? lc.hide() : lc.show());
  doc.addEventListener('visibilitychange', sync);
  win.addEventListener('pagehide', () => lc.hide());
  win.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) {
      lc.hide(); // restored from the back-forward cache: treat it as a return from the background
      lc.show();
    }
  });
  doc.addEventListener('freeze', () => lc.hide());
  doc.addEventListener('resume', () => doc.visibilityState !== 'hidden' && lc.show());
}
