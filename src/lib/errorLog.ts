// A small local log of the last errors, for "انسخي التقرير" under المزيد → بياناتك. It stays on the device (its key isn't
// an app key, so it's not in backups or sync) and holds no personal data: message, page name and time only.
// Also notices when the app was killed while on screen (iOS out of memory): a marker is kept while visible and removed
// when leaving normally, so a marker found at startup means the last run ended abruptly.

const LOG_KEY = 'sotylog.errors';
const ALIVE_KEY = 'sotylog.alive';
export const MAX_LOG = 20;

export interface LogEntry {
  t: number;
  kind: 'error' | 'rejection' | 'render' | 'killed' | 'storage';
  page: string;
  msg: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultStore = (): Store | null => (typeof localStorage === 'undefined' ? null : localStorage);

/** Only the page name: never ids, tokens or anything else from the address. */
export function pageName(hash: string): string {
  if (hash && !hash.startsWith('#/')) return 'auth';
  return hash.replace(/^#\/?/, '').split('/')[0].replace(/[^a-z-]/gi, '') || 'home';
}

/** Short, with emails and long tokens taken out. */
export function cleanMessage(msg: string): string {
  return msg
    .replace(/[^\s@]+@[^\s@]+/g, '[email]')
    .replace(/[A-Za-z0-9_-]{24,}/g, '[…]')
    .slice(0, 200);
}

export function readLog(store: Store | null = defaultStore()): LogEntry[] {
  try {
    const v = JSON.parse(store?.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function logError(kind: LogEntry['kind'], msg: string, page?: string, store: Store | null = defaultStore(), now = Date.now()) {
  try {
    const p = page ?? (typeof location === 'undefined' ? 'home' : pageName(location.hash));
    store?.setItem(LOG_KEY, JSON.stringify([...readLog(store), { t: now, kind, page: p, msg: cleanMessage(msg) }].slice(-MAX_LOG)));
  } catch {
    // the log must never be the thing that fails
  }
}

export function clearLog(store: Store | null = defaultStore()) {
  try {
    store?.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}

/** The text she copies and sends. */
export function formatReport(entries: LogEntry[], info: string): string {
  const lines = entries.map((e) => `${new Date(e.t).toISOString().slice(0, 19)} ${e.kind} [${e.page}] ${e.msg}`);
  return [`Soty report — ${info}`, ...(lines.length ? lines : ['no errors'])].join('\n');
}

// ---- "the app was killed while on screen"

export function markAlive(page: string, busy: string[], store: Store | null = defaultStore(), now = Date.now()) {
  try {
    store?.setItem(ALIVE_KEY, JSON.stringify({ t: now, page, busy }));
  } catch {
    // ignore
  }
}

export function clearAlive(store: Store | null = defaultStore()) {
  try {
    store?.removeItem(ALIVE_KEY);
  } catch {
    // ignore
  }
}

/** At startup: did the last run end abruptly while on screen? Logs it and returns the page she was on. */
export function checkLastRun(store: Store | null = defaultStore()): { page: string; route: string } | null {
  try {
    const raw = store?.getItem(ALIVE_KEY);
    if (!raw) return null;
    store?.removeItem(ALIVE_KEY);
    const a = JSON.parse(raw) as { t: number; page: string; busy?: string[]; route?: string };
    logError('killed', `app closed abruptly while on screen (busy: ${a.busy?.join(',') || 'nothing'})`, a.page, store, a.t);
    return { page: a.page, route: a.page === 'home' ? '' : a.page };
  } catch {
    return null;
  }
}
