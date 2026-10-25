// Offline support: registers the service worker (production build only), tells the UI when a new version
// is waiting, and whether we're online.

import { useEffect, useState } from 'react';

let waiting: ServiceWorker | null = null;
let updating = false; // set when the user taps "حدّثي"
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void (async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        const check = () => {
          // a new version is ready only if an older one is controlling the page (not on the very first install)
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = w;
            emit();
          }
        };
        w.addEventListener('statechange', check);
        check();
      };
      track(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // look for a new deploy whenever the app comes back to the front
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // the first install also takes control (clients.claim) — only reload for an update she asked for
        if (reloaded || !updating) return;
        reloaded = true;
        window.location.reload(); // the new version took over: load it fully (never a mix)
      });
    } catch {
      // no offline support (private mode, old browser) — the app still works online
    }
  })();
}

export function useUpdateWaiting(): { waiting: boolean; update: () => void } {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return {
    waiting: !!waiting,
    update: () => {
      updating = true;
      waiting?.postMessage('skipWaiting');
    },
  };
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}
