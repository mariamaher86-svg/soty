// An in-memory Supabase for component tests: accounts (email + password) and her rows and files.
// Installed by setup.ts in place of @supabase/supabase-js, so no test can ever reach the real project.

import type { RemoteDoc, SyncBackend } from '../lib/sync';

interface User {
  id: string;
  email: string;
  password: string;
}

type Session = { user: { id: string; email: string } } | null;

export const server = {
  users: [] as User[],
  rows: new Map<string, RemoteDoc>(),
  files: new Map<string, { bytes: Uint8Array; contentType: string }>(),
  clock: Date.parse('2026-11-01T10:00:00Z'),
  /** the next N calls fail like a dropped network */
  failNext: 0,
  /** "Confirm email" turned on in the dashboard: sign-up gives no session */
  confirmEmail: false,
  session: null as Session,
  /** /auth/v1/health answers (false = blocked by the network) */
  reachable: true,
  /** small tables (push_subscriptions, notification_prefs): rows as the database would keep them, RLS applied */
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as string[],
  reset() {
    this.users = [];
    this.rows = new Map();
    this.files = new Map();
    this.failNext = 0;
    this.confirmEmail = false;
    this.session = null;
    this.reachable = true;
    this.calls = [];
    this.tables = {};
    authSubs.clear();
  },
  tick() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  },
  maybeFail(name: string) {
    this.calls.push(name);
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('network');
    }
  },
};

const authSubs = new Set<(e: string, s: Session) => void>();
const emit = (e: string) => authSubs.forEach((f) => f(e, server.session));

const fakeAuth = {
  async signUp({ email, password }: { email: string; password: string }) {
    server.calls.push('signUp');
    if (server.users.some((u) => u.email === email)) return { data: { user: null, session: null }, error: { code: 'user_already_exists', message: 'User already registered' } };
    if (password.length < 6) return { data: { user: null, session: null }, error: { code: 'weak_password', message: 'weak' } };
    const u = { id: 'u' + (server.users.length + 1), email, password };
    server.users.push(u);
    if (server.confirmEmail) return { data: { user: { id: u.id, email, identities: [{}] }, session: null }, error: null };
    server.session = { user: { id: u.id, email } };
    emit('SIGNED_IN');
    return { data: { user: { id: u.id, email }, session: server.session }, error: null };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    server.calls.push('signIn');
    const u = server.users.find((x) => x.email === email && x.password === password);
    if (!u) return { data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } };
    server.session = { user: { id: u.id, email } };
    emit('SIGNED_IN');
    return { data: { user: { id: u.id, email }, session: server.session }, error: null };
  },
  async resetPasswordForEmail() {
    server.calls.push('reset');
    return { error: null };
  },
  async updateUser({ password }: { password: string }) {
    server.calls.push('updateUser');
    const u = server.users.find((x) => x.id === server.session?.user.id);
    if (!u) return { error: { code: 'session_not_found', message: 'no session' } };
    u.password = password;
    return { error: null };
  },
  async signOut() {
    server.session = null;
    emit('SIGNED_OUT');
    return { error: null };
  },
  async getSession() {
    return { data: { session: server.session }, error: null };
  },
  async getUser() {
    return { data: { user: server.session?.user ?? null }, error: null };
  },
  onAuthStateChange(cb: (e: string, s: Session) => void) {
    authSubs.add(cb);
    return { data: { subscription: { unsubscribe: () => authSubs.delete(cb) } } };
  },
};


/** The primary key of each small table (what an upsert replaces on). */
const KEYS: Record<string, string> = { push_subscriptions: 'endpoint', notification_prefs: 'user_id' };

/**
 * supabase.from(table) for the small tables, with the database rules: a signed-in person only writes rows with her own
 * user_id (it's filled in from the session, like `default auth.uid()`), and only sees and deletes her own.
 */
function fakeFrom(table: string) {
  const rows = () => (server.tables[table] ??= []);
  const me = () => server.session?.user.id ?? null;
  const filters: [string, unknown][] = [];
  const mine = () => rows().filter((r) => r.user_id === me() && filters.every(([c, v]) => r[c] === v));
  const q = {
    eq(col: string, v: unknown) {
      filters.push([col, v]);
      return q;
    },
    async upsert(input: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
      server.calls.push(`upsert ${table}`);
      if (server.failNext > 0) {
        server.failNext--;
        return { error: { message: 'network' } };
      }
      if (!me()) return { error: { message: 'not signed in' } };
      const key = opts?.onConflict ?? KEYS[table];
      for (const r of Array.isArray(input) ? input : [input]) {
        const row: Record<string, unknown> = { user_id: me(), ...r };
        if (row.user_id !== me()) return { error: { message: 'row-level security' } };
        const at = rows().findIndex((x) => x[key] === row[key]);
        if (at >= 0 && rows()[at].user_id !== me()) return { error: { message: 'row-level security' } };
        if (at >= 0) rows()[at] = { ...rows()[at], ...row };
        else rows().push(row);
      }
      return { error: null };
    },
    delete() {
      server.calls.push(`delete ${table}`);
      return {
        eq: async (col: string, v: unknown) => {
          filters.push([col, v]);
          const keep = rows().filter((r) => !mine().includes(r));
          server.tables[table] = keep;
          return { error: null };
        },
      };
    },
    select() {
      return { eq: (col: string, v: unknown) => (filters.push([col, v]), Promise.resolve({ data: mine(), error: null })), then: (f: (x: unknown) => unknown) => Promise.resolve({ data: mine(), error: null }).then(f) };
    },
  };
  return q;
}

export function createClient() {
  return { auth: fakeAuth, from: fakeFrom };
}

/** Her rows and files: the same contract the real backend keeps. */
export function fakeBackend(): SyncBackend {
  return {
    async getDocs() {
      server.maybeFail('getDocs');
      return [...server.rows.values()].map((r) => ({ ...r }));
    },
    async putDocs(docs) {
      server.maybeFail('putDocs');
      return docs.map((d) => {
        const row = { key: d.key, value: d.value, updated_at: server.tick() };
        server.rows.set(d.key, row);
        return { ...row };
      });
    },
    async deleteAll() {
      server.maybeFail('deleteAll');
      server.rows.clear();
      server.files.clear();
    },
    async listFiles() {
      server.maybeFail('listFiles');
      return [...server.files.entries()].map(([path, f]) => ({ path, size: f.bytes.length }));
    },
    async upload(path, bytes, contentType) {
      server.maybeFail('upload');
      server.files.set(path, { bytes, contentType });
    },
    async download(path) {
      server.maybeFail('download');
      const f = server.files.get(path);
      if (!f) throw new Error('not found');
      return f;
    },
    async removeFiles(paths) {
      server.maybeFail('removeFiles');
      paths.forEach((p) => server.files.delete(p));
    },
  };
}
