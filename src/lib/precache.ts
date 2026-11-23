// Offline: the list of files the service worker stores on first load (used by the build, see vite.config.ts).
// Pure so it can be tested; runs in Node at build time.

/** Every file of the built app, as URLs relative to the app's folder, sorted, without source maps or the worker itself. */
export function precacheList(files: string[]): string[] {
  const keep = files
    .map((f) => f.replace(/\\/g, '/').replace(/^\.?\//, ''))
    .filter((f) => f && !f.endsWith('.map') && f !== 'sw.js' && !f.startsWith('.') && !f.includes('/.'));
  return [...new Set(['./', ...keep.map((f) => './' + f)])].sort();
}

/** A version id that changes whenever any file name changes (built asset names contain content hashes). */
export function precacheVersion(list: string[], salt = ''): string {
  let h = 2166136261;
  for (const ch of salt + list.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return 'soty-' + (h >>> 0).toString(36);
}

/** The service worker source for a precache list. */
export function serviceWorkerSource(list: string[], version: string): string {
  return `// Generated at build time — do not edit. Offline cache for صوتي.
const VERSION = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(list)};

self.addEventListener('install', (e) => {
  // a whole new copy in its own cache; it waits until the user taps "حدّثي" (no mixing of old and new files)
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('soty-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// reminders (Web Push): the server sends { title, body, url, tag }; tapping opens the app on that page
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  const url = new URL(d.url || './', self.registration.scope).href;
  e.waitUntil(
    self.registration.showNotification(d.title || 'صوتي', {
      body: d.body || '',
      icon: new URL('./icons/icon-192.png', self.registration.scope).href,
      badge: new URL('./icons/icon-192.png', self.registration.scope).href,
      tag: d.tag || 'soty',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (open) return (open.navigate ? open.navigate(url).catch(() => open) : Promise.resolve(open)).then((c) => (c || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // YouTube etc. go to the network
  e.respondWith(
    caches.open(VERSION).then(async (c) => {
      // match by address only: module scripts are requested with an Origin header, and servers that send
      // "Vary: Origin" would otherwise never match the stored copy
      const opts = { ignoreVary: true };
      if (req.mode === 'navigate') return (await c.match('./index.html', opts)) || (await c.match('./', opts)) || fetch(req);
      return (await c.match(req.url, opts)) || fetch(req);
    }),
  );
});
`;
}
