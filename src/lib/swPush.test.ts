// The service worker's reminder handlers, run from the very source the build writes to sw.js.
import { describe, expect, it, vi } from 'vitest';
import { serviceWorkerSource } from './precache';

const SCOPE = 'https://mariamaher86-svg.github.io/soty/';

/** Loads sw.js into a fake worker global and returns a way to fire its events. */
function worker(windows: { url: string }[] = []) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: NotificationOptions & { data?: { url: string } } }[] = [];
  const focused: string[] = [];
  const navigated: string[] = [];
  const opened: string[] = [];
  const clients = windows.map((w) => ({
    url: w.url,
    focus: vi.fn(async function (this: { url: string }) {
      focused.push(this.url);
    }),
    navigate: vi.fn(async function (this: { url: string }, to: string) {
      navigated.push(to);
      this.url = to;
      return this;
    }),
  }));
  const self = {
    addEventListener: (type: string, f: (e: unknown) => void) => (listeners[type] = f),
    registration: { scope: SCOPE, showNotification: async (title: string, options: NotificationOptions) => void shown.push({ title, options }) },
    clients: { matchAll: async () => clients, openWindow: async (u: string) => void opened.push(u), claim: async () => {} },
    skipWaiting: () => {},
    location: { origin: 'https://mariamaher86-svg.github.io' },
  };
  new Function('self', 'caches', serviceWorkerSource(['./'], 'soty-test'))(self, {});
  const fire = async (type: string, e: Record<string, unknown>) => {
    let waited: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...e, waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
  };
  return { fire, shown, focused, navigated, opened, clients };
}

const pushEvent = (payload: unknown) => ({ data: { json: () => payload, text: () => String(payload) } });

describe('service worker: reminders', () => {
  it('a push shows the notification with the icon, badge, tag and where to open', async () => {
    const w = worker();
    await w.fire('push', pushEvent({ title: 'صوتي', body: '🎤 وقت تمرين النهارده — ١٠ دقايق بس', url: '#/path', tag: 'daily' }));
    expect(w.shown).toEqual([
      {
        title: 'صوتي',
        options: { body: '🎤 وقت تمرين النهارده — ١٠ دقايق بس', icon: SCOPE + 'icons/icon-192.png', badge: SCOPE + 'icons/icon-192.png', tag: 'daily', data: { url: SCOPE + '#/path' } },
      },
    ]);
  });

  it('a push without JSON still shows something', async () => {
    const w = worker();
    await w.fire('push', { data: { json: () => JSON.parse('nope'), text: () => 'نص' } });
    expect(w.shown[0]).toMatchObject({ title: 'صوتي', options: { body: 'نص', tag: 'soty' } });
  });

  it('tapping it with the app open: that window goes to the page and comes to the front', async () => {
    const w = worker([{ url: SCOPE + '#/' }, { url: 'https://other.example/' }]);
    const close = vi.fn();
    await w.fire('notificationclick', { notification: { close, data: { url: SCOPE + '#/path' } } });
    expect(close).toHaveBeenCalled();
    expect(w.navigated).toEqual([SCOPE + '#/path']);
    expect(w.focused).toEqual([SCOPE + '#/path']);
    expect(w.opened).toEqual([]);
  });

  it('tapping it with the app closed opens it under /soty/ on that page', async () => {
    const w = worker([{ url: 'https://other.example/' }]);
    await w.fire('notificationclick', { notification: { close: () => {}, data: { url: SCOPE + '#/path' } } });
    expect(w.opened).toEqual([SCOPE + '#/path']);
  });

  it('a notification without a page opens the app home', async () => {
    const w = worker();
    await w.fire('notificationclick', { notification: { close: () => {}, data: null } });
    expect(w.opened).toEqual([SCOPE]);
  });
});
