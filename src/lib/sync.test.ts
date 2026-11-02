import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkReachable,
  createScheduler,
  FILE_STATE_KEY,
  hashString,
  mergeDoc,
  normalizeOtp,
  planDocs,
  planFiles,
  readConfig,
  setFileState,
  songFilePath,
  songKeyOfPath,
  storagePath,
  syncableKey,
  syncDocs,
  teacherPath,
  validEmail,
  type Dirty,
  type LocalDocs,
  type RemoteDoc,
  type SyncBackend,
  type SyncMeta,
} from './sync';
import { buildBackup, planStorage } from './backup';

// ---- fakes

/** Her Supabase project, in memory: one row per key with a server clock, plus a file bucket. */
class FakeBackend implements SyncBackend {
  rows = new Map<string, RemoteDoc>();
  files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  clock = Date.parse('2026-11-01T10:00:00Z');
  failNext = 0;
  private tick() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
  private maybeFail() {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('network');
    }
  }
  async getDocs() {
    this.maybeFail();
    return [...this.rows.values()].map((r) => ({ ...r }));
  }
  async putDocs(docs: { key: string; value: string }[]) {
    this.maybeFail();
    return docs.map((d) => {
      const row = { key: d.key, value: d.value, updated_at: this.tick() };
      this.rows.set(d.key, row);
      return { ...row };
    });
  }
  async deleteAll() {
    this.rows.clear();
    this.files.clear();
  }
  async listFiles() {
    return [...this.files.entries()].map(([path, f]) => ({ path, size: f.bytes.length }));
  }
  async upload(path: string, bytes: Uint8Array, contentType: string) {
    this.files.set(path, { bytes, contentType });
  }
  async download(path: string) {
    return this.files.get(path)!;
  }
  async removeFiles(paths: string[]) {
    paths.forEach((p) => this.files.delete(p));
  }
}

/** One device's localStorage + its sync bookkeeping. */
class FakeDevice implements LocalDocs {
  data: Record<string, string>;
  meta: SyncMeta = {};
  dirty: Dirty = {};
  constructor(data: Record<string, string> = {}) {
    this.data = { ...data };
  }
  edit(key: string, value: string, at: number) {
    this.data[key] = value;
    this.dirty[key] = at;
  }
  read() {
    return { ...this.data };
  }
  write(set: Record<string, string>) {
    Object.assign(this.data, set);
  }
  getMeta() {
    return this.meta;
  }
  setMeta(m: SyncMeta) {
    this.meta = m;
  }
  getDirty() {
    return this.dirty;
  }
  clearDirty(upTo: number) {
    for (const [k, t] of Object.entries(this.dirty)) if (t <= upTo) delete this.dirty[k];
  }
}

const result = (ts: number, value = 80, type = 'match') => ({ type, value, date: '2026-11-01', ts });
const data = (...results: ReturnType<typeof result>[]) => JSON.stringify({ results });
const song = (id: string, title: string, updatedAt: number) => ({ id, title, tags: [], createdAt: 1, updatedAt });
const resultsOf = (d: FakeDevice) => JSON.parse(d.data['soty.v1']).results.map((r: { ts: number }) => r.ts);

describe('what is synced', () => {
  it('app keys only, and not the settings that belong to one device', () => {
    expect(syncableKey('soty.v1')).toBe(true);
    expect(syncableKey('soty.songs')).toBe(true);
    expect(syncableKey('soty.pref.gender')).toBe(true);
    expect(syncableKey('soty.pref.rhythm.latency')).toBe(false); // each phone has its own delay
    expect(syncableKey('soty.pref.noise.rms')).toBe(false);
    expect(syncableKey('sb-abc-auth-token')).toBe(false);
  });
  it('the format is the backup format: a backup restored with "merge" and a sync combine results the same way', () => {
    const a = data(result(1), result(2));
    const b = data(result(2), result(3));
    const viaBackup = planStorage({ 'soty.v1': a }, buildBackup({ 'soty.v1': b }, []), 'merge').set['soty.v1'];
    expect(mergeDoc('soty.v1', a, b)).toBe(viaBackup);
  });
});

describe('merge rules', () => {
  it('results combined without duplicates; songs by id, the newest edit wins', () => {
    const merged = JSON.parse(mergeDoc('soty.v1', data(result(1), result(2)), data(result(2), result(3)))!);
    expect(merged.results.map((r: { ts: number }) => r.ts)).toEqual([1, 2, 3]);
    const songs = JSON.parse(mergeDoc('soty.songs', JSON.stringify([song('s1', 'old', 1)]), JSON.stringify([song('s1', 'new', 5), song('s2', 'x', 1)]))!);
    expect(songs.map((s: { title: string }) => s.title)).toEqual(['new', 'x']);
    expect(mergeDoc('soty.pref.gender', 'f', 'm')).toBeNull();
  });
  it('a settings conflict: the newest change wins (by time)', () => {
    const at = '2026-11-01T10:00:00Z';
    const remote: RemoteDoc[] = [{ key: 'soty.pref.theme', value: 'dark', updated_at: at }];
    const meta: SyncMeta = { 'soty.pref.theme': { hash: hashString('light-old'), at: '2026-10-01T00:00:00Z' } };
    const newerHere = planDocs({ 'soty.pref.theme': 'light' }, remote, meta, { 'soty.pref.theme': Date.parse(at) + 5000 });
    expect(newerHere.push).toEqual([{ key: 'soty.pref.theme', value: 'light' }]);
    const olderHere = planDocs({ 'soty.pref.theme': 'light' }, remote, meta, { 'soty.pref.theme': Date.parse(at) - 5000 });
    expect(olderHere.setLocal).toEqual({ 'soty.pref.theme': 'dark' });
  });
  it('only one side changed → that side wins (clearing results here really clears them on the server)', () => {
    const remote: RemoteDoc[] = [{ key: 'soty.v1', value: data(result(1)), updated_at: 'T1' }];
    const meta: SyncMeta = { 'soty.v1': { hash: hashString(data(result(1))), at: 'T1' } };
    const p = planDocs({ 'soty.v1': data() }, remote, meta, {});
    expect(p.push).toEqual([{ key: 'soty.v1', value: data() }]);
    expect(p.setLocal).toEqual({});
  });
});

describe('two devices through the server', () => {
  it('first sign-in on a phone that already has data: local + server merged, nothing wiped, with a summary', async () => {
    const server = new FakeBackend();
    const laptop = new FakeDevice({ 'soty.v1': data(result(1), result(2)), 'soty.songs': JSON.stringify([song('s1', 'A', 1)]), 'soty.pref.gender': 'f' });
    expect((await syncDocs(server, laptop)).pushed).toBe(3);
    const phone = new FakeDevice({ 'soty.v1': data(result(2), result(3)), 'soty.songs': JSON.stringify([song('s2', 'B', 1)]) });
    const s = await syncDocs(server, phone);
    expect(resultsOf(phone)).toEqual([1, 2, 3]);
    expect(JSON.parse(phone.data['soty.songs']).map((x: { id: string }) => x.id).sort()).toEqual(['s1', 's2']);
    expect(phone.data['soty.pref.gender']).toBe('f');
    expect(s).toMatchObject({ newResults: 1, newSongs: 1, merged: 2 });
    // the server now has everything too, and the laptop gets the phone's result on its next sync
    await syncDocs(server, laptop);
    expect(resultsOf(laptop)).toEqual([1, 2, 3]);
  });
  it('after both are in sync, a new result on one device reaches the other; a second sync changes nothing', async () => {
    const server = new FakeBackend();
    const a = new FakeDevice({ 'soty.v1': data(result(1)) });
    const b = new FakeDevice();
    await syncDocs(server, a);
    await syncDocs(server, b);
    a.edit('soty.v1', data(result(1), result(9)), Date.now());
    await syncDocs(server, a);
    const s = await syncDocs(server, b);
    expect(resultsOf(b)).toEqual([1, 9]);
    expect(s.pulled).toBe(1);
    const again = await syncDocs(server, b);
    expect(again).toMatchObject({ pulled: 0, pushed: 0, merged: 0 });
  });
  it('both devices added results offline → merged, no duplicates', async () => {
    const server = new FakeBackend();
    const a = new FakeDevice({ 'soty.v1': data(result(1)) });
    const b = new FakeDevice();
    await syncDocs(server, a);
    await syncDocs(server, b);
    a.edit('soty.v1', data(result(1), result(2)), Date.now());
    b.edit('soty.v1', data(result(1), result(3)), Date.now());
    await syncDocs(server, a);
    await syncDocs(server, b);
    await syncDocs(server, a);
    expect(resultsOf(a)).toEqual([1, 2, 3]);
    expect(resultsOf(b)).toEqual([1, 2, 3]);
  });
  it('a failed sync changes nothing and leaves the change waiting (the offline queue)', async () => {
    const server = new FakeBackend();
    const a = new FakeDevice({ 'soty.v1': data(result(1)) });
    server.failNext = 1;
    await expect(syncDocs(server, a)).rejects.toThrow('network');
    expect(a.meta).toEqual({});
    expect(server.rows.size).toBe(0);
    await syncDocs(server, a);
    expect(server.rows.get('soty.v1')!.value).toBe(data(result(1)));
  });
  it('device-only settings never leave the device', async () => {
    const server = new FakeBackend();
    await syncDocs(server, new FakeDevice({ 'soty.pref.rhythm.latency': '0.121', 'soty.pref.gender': 'm' }));
    expect([...server.rows.keys()]).toEqual(['soty.pref.gender']);
  });
});

describe('files', () => {
  it('storage paths start with her user id (the bucket policy checks it)', () => {
    expect(storagePath('u-123', teacherPath(1730000000000))).toBe('u-123/teacher/1730000000000.json');
    const p = songFilePath('s1::p2', 'سوبرانو.mp3');
    expect(p).toBe('songs/s1%3A%3Ap2/%D8%B3%D9%88%D8%A8%D8%B1%D8%A7%D9%86%D9%88.mp3');
    expect(songKeyOfPath(p)).toBe('s1::p2');
    expect(songKeyOfPath('teacher/1.json')).toBeNull();
  });
  it('send what the server lacks, fetch what this device lacks, never bring back a file deleted on purpose', () => {
    const local = [{ path: 'teacher/1.json', size: 10 }, { path: 'teacher/2.json', size: 10 }];
    const remote = [{ path: 'teacher/2.json', size: 10 }, { path: 'teacher/3.json', size: 10 }, { path: songFilePath('s1', 'a.mp3'), size: 5 }];
    let state = setFileState(null, 'teacher/3.json', true, 100);
    state = setFileState(state, 'songs/s1', true, 100);
    expect(planFiles(local, remote, state)).toEqual({ upload: ['teacher/1.json'], download: [], remove: ['teacher/3.json', songFilePath('s1', 'a.mp3')] });
    // recorded again later → allowed again
    const back = setFileState(state, 'teacher/3.json', false, 200);
    expect(planFiles([], remote, back).download).toContain('teacher/3.json');
    // the newest mark wins when two devices disagree
    expect(JSON.parse(mergeDoc(FILE_STATE_KEY, back, state)!)['teacher/3.json']).toEqual({ deleted: false, at: 200 });
  });
});

describe('song files: one per song', () => {
  it('a new file for a song replaces the server copy (other name), and the old copy is never fetched back', () => {
    const local = [{ path: songFilePath('s1', 'new.mp3'), size: 9 }];
    const remote = [{ path: songFilePath('s1', 'old.mp3'), size: 5 }, { path: songFilePath('s2', 'x.mp3'), size: 5 }];
    expect(planFiles(local, remote, undefined)).toEqual({ upload: [songFilePath('s1', 'new.mp3')], download: [songFilePath('s2', 'x.mp3')], remove: [songFilePath('s1', 'old.mp3')] });
  });
});

describe('sign-in input and config', () => {
  it('the email code: 6 digits, Arabic digits and spaces are fine', () => {
    expect(normalizeOtp('123456')).toBe('123456');
    expect(normalizeOtp(' ١٢٣ ٤٥٦ ')).toBe('123456');
    expect(normalizeOtp('12345')).toBeNull();
    expect(normalizeOtp('1234567')).toBeNull();
    expect(normalizeOtp('12a456')).toBeNull();
    expect(validEmail('maria@example.com')).toBe(true);
    expect(validEmail('maria@')).toBe(false);
  });
  it('missing or broken config = sync not set up (everything else keeps working)', () => {
    expect(readConfig('', '')).toBeNull();
    expect(readConfig('https://abc.supabase.co', '')).toBeNull();
    expect(readConfig('http://abc.supabase.co', 'x'.repeat(40))).toBeNull();
    expect(readConfig(' https://abc.supabase.co/ ', ' sb_publishable_' + 'x'.repeat(30) + ' ')).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_' + 'x'.repeat(30) });
  });
});

describe('network', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('reachable / blocked (hangs or fails) / offline — never hangs', async () => {
    const ok = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    expect(await checkReachable('https://x.supabase.co', 'k', ok, true)).toBe('ok');
    expect(await checkReachable('https://x.supabase.co', 'k', ok, false)).toBe('offline');
    const fail = vi.fn(async () => {
      throw new TypeError('blocked');
    }) as unknown as typeof fetch;
    expect(await checkReachable('https://x.supabase.co', 'k', fail, true)).toBe('blocked');
    const hang = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const p = checkReachable('https://x.supabase.co', 'k', hang, true, 6000);
    vi.advanceTimersByTime(6000);
    expect(await p).toBe('blocked');
  });
  it('the scheduler: requests are debounced, failures retry later, coming online retries now', async () => {
    let calls = 0;
    let fail = true;
    const s = createScheduler(
      async () => {
        calls++;
        if (fail) throw new Error('offline');
      },
      { debounceMs: 3000, retryMs: [30000, 120000] },
    );
    s.request();
    s.request();
    s.request();
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls).toBe(1); // three requests, one sync
    expect(s.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(29000);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2); // retry after 30 s
    fail = false;
    s.online(); // network back: right away
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(3);
    expect(s.pending()).toBe(false);
    await vi.advanceTimersByTimeAsync(600000);
    expect(calls).toBe(3); // nothing waiting → no more syncs
  });
});
