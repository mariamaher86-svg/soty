// Helpers for page tests: render the whole app at a route, move fake time, sing, leave and come back.

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../App';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { installAudioUnlock } from '../audio/audio';
import { installLifecycle } from '../lib/lifecycle';
import { setPref } from '../lib/storage';
import { startPlainText } from '../lib/plainText';
import { mic } from './fakeMic';
import { setVisibility } from './setup';

let installed = false;

/** A device that already went through the welcome and picked how to be addressed. */
export function prime({ gender = 'f', welcome = true }: { gender?: 'f' | 'm' | null; welcome?: boolean } = {}) {
  if (welcome) setPref('welcome.done', '1');
  if (gender) setPref('gender', gender);
}

/** The whole app (top bar, page, tab bar, toasts) at `#/route`, as main.tsx renders it. */
export function renderApp(route = '', opts: { prime?: boolean } = {}) {
  if (!installed) {
    installLifecycle();
    installAudioUnlock();
    startPlainText(document.body); // as main.tsx does
    installed = true;
  }
  if (opts.prime !== false) prime();
  window.location.hash = route ? `#/${route}` : '';
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
  const r = render(
    <ErrorBoundary whole>
      <App />
    </ErrorBoundary>,
  );
  return { user, ...r };
}

/** Let fake time pass (timers, animation frames, the audio clock), flushing React updates. */
export async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    // IndexedDB (fake-indexeddb) finishes on real setImmediate turns, which fake timers don't move
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => (globalThis as unknown as { setImmediate: (f: (v?: unknown) => void) => void }).setImmediate(r));
      await vi.advanceTimersByTimeAsync(0);
    }
  });
}

/** Sing a MIDI note (optionally off by some cents) for `ms`. */
export async function sing(midi: number, ms: number, cents = 0) {
  mic.sing(midi, cents);
  await tick(ms);
}

export async function hiss(ms: number) {
  mic.hiss();
  await tick(ms);
}

export async function silence(ms: number) {
  mic.silence();
  await tick(ms);
}

/** The phone goes to the home screen / locks, then comes back. */
export async function leaveApp() {
  await act(async () => {
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

export async function returnToApp() {
  await act(async () => {
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await tick(50);
}

/** Navigate like tapping a link. */
export async function go(route: string) {
  await act(async () => {
    window.location.hash = `#/${route}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await tick(20);
}

export const button = (name: string | RegExp) => screen.getByRole('button', { name });
export const queryButton = (name: string | RegExp) => screen.queryByRole('button', { name });
export const buttons = (name: string | RegExp) => screen.queryAllByRole('button', { name });
/** the page area (without the top bar and tab bar) */
export const main = () => within(document.querySelector('main')!);
/** no crash screen */
export const crashed = () => !!document.querySelector('.crash, [data-crash]') || /حصلت مشكلة|حصل خطأ/.test(document.body.textContent ?? '');

/** Open the page's "⚙️ خيارات" sheet (sound, speed, videos, tips…), do something there, and close it. */
export async function inOptions(user: ReturnType<typeof userEvent.setup>, fn: () => Promise<void> | void) {
  await user.click(screen.getAllByRole('button', { name: 'خيارات' }).at(-1)!);
  await fn();
  const close = screen.queryAllByRole('button', { name: 'قفل الخيارات' }).at(-1);
  if (close) await user.click(close);
}
