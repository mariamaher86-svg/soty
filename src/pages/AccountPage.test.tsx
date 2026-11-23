// The sign-in gate (first screen), the account page, sync against the fake Supabase, signing out (sync, then wipe),
// and the password-recovery page.
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { button, go, renderApp, signedOut, tick, TEST_USER } from '../test/app';
import { server } from '../test/fakeSupabase';
import { addResult, getResults, getSongs, saveSongs, setPref } from '../lib/storage';
import { lifecycle } from '../lib/lifecycle';
import { AUTH_KEY, installSync, SIGN_OUT_SYNC_FAILED } from '../sync/account';
import { RecoveryPage } from './RecoveryPage';
import { BLOCKED_MSG, OFFLINE_MSG } from '../lib/auth';
import { browser } from '../lib/reload';
import { normalizeSong } from '../lib/songs';
import { listSongFiles, saveSongFile } from '../audio/songFiles';

const email = () => screen.getByLabelText('إيميلك') as HTMLInputElement;
const password = () => screen.getAllByLabelText(/باسورد|الباسورد/)[0] as HTMLInputElement;
const submit = () => document.querySelector('form button[type="submit"]') as HTMLButtonElement;
const modeChip = (name: string) => within(screen.getByRole('group', { name: 'دخول أو حساب جديد' })).getByRole('button', { name });
const gate = () => screen.queryByRole('main', { name: 'الدخول' });

async function signUp(user: ReturnType<typeof renderApp>['user'], mail = 'maria@test.dev', pass = 'password123') {
  await user.click(modeChip('إنشاء حساب'));
  await user.type(email(), mail);
  await user.type(password(), pass);
  await user.type(screen.getByLabelText(/اكتبي|تأكيد|تاني/), pass);
  await user.click(submit());
  await tick(5000);
}

async function signInWith(user: ReturnType<typeof renderApp>['user'], mail: string, pass: string) {
  await user.clear(email());
  await user.type(email(), mail);
  await user.type(password(), pass);
  await user.click(submit());
  await tick(5000);
}

const offline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, value: !v });

describe('the sign-in gate', () => {
  it('without a session no route renders: home, deep links, lessons, the help; only the sign-in', async () => {
    renderApp('', { signedIn: false });
    for (const r of ['', 'piano', 'lessons/note', 'lessons/glossary', 'songs', 'path/start', 'more', 'account', 'exercises/pitch']) {
      await go(r);
      expect(gate(), r).toBeTruthy();
      expect(document.querySelector('.tabbar'), r).toBeNull();
      expect(document.querySelector('.help-toggle'), r).toBeNull();
      expect(document.querySelector('.welcome'), r).toBeNull();
    }
    expect(document.querySelector('.gate .app-logo')).toBeTruthy(); // the new logo on the sign-in
  });

  it('a new account signs in and the welcome follows; the deep link she opened is then shown', async () => {
    const { user } = renderApp('piano', { signedIn: false, prime: false });
    await user.click(modeChip('إنشاء حساب'));
    await user.type(email(), 'new@test.dev');
    await user.type(password(), 'short');
    expect(submit().disabled).toBe(true);
    await user.clear(password());
    await user.clear(email());
    await signUp(user, 'new@test.dev');
    expect(gate()).toBeNull();
    expect(screen.getByRole('dialog', { name: 'ترحيب' })).toBeTruthy();
  });

  it('first sign-in on a phone that already had her data: nothing is wiped, it is merged into the account', async () => {
    addResult('match', 70, '7/10');
    saveSongs([normalizeSong({ title: 'أغنية قبل الحساب' })]);
    server.users.push({ id: 'u9', email: 'maria@test.dev', password: 'password123' });
    server.rows.set('soty.v1', { key: 'soty.v1', value: JSON.stringify({ results: [{ type: 'sustain', value: 9, date: '2026-11-14', ts: 1 }] }), updated_at: server.tick() });
    const { user } = renderApp('', { signedIn: false });
    await signInWith(user, 'maria@test.dev', 'password123');
    expect(gate()).toBeNull();
    expect(getResults().map((r) => r.type).sort()).toEqual(['match', 'sustain']);
    expect(getSongs()[0].title).toBe('أغنية قبل الحساب');
    expect(JSON.parse(server.rows.get('soty.v1')!.value).results).toHaveLength(2); // the server got this phone's data too
  });

  it('a wrong password says so in Arabic and stays on the gate', async () => {
    server.users.push({ id: 'u9', email: 'maria@test.dev', password: 'password123' });
    const { user } = renderApp('', { signedIn: false });
    await signInWith(user, 'maria@test.dev', 'wrongpass1');
    expect(document.querySelector('.error')!.textContent).toMatch(/[؀-ۿ]/);
    expect(gate()).toBeTruthy();
  });

  it('an existing email on sign-up is refused', async () => {
    server.users.push({ id: 'u1', email: 'maria@test.dev', password: 'password123' });
    const { user } = renderApp('', { signedIn: false });
    await signUp(user);
    expect(document.querySelector('.error')).toBeTruthy();
    expect(server.session).toBeNull();
    expect(gate()).toBeTruthy();
  });

  it('first time and offline: it says the first sign-in needs internet, and trying says so too', async () => {
    offline(true);
    const { user } = renderApp('', { signedIn: false });
    expect(screen.getByText(/أول دخول محتاج إنترنت/)).toBeTruthy();
    await signInWith(user, 'maria@test.dev', 'password123');
    expect(screen.getByText(OFFLINE_MSG)).toBeTruthy();
    offline(false);
  });

  it('a blocked network says so without hanging', async () => {
    server.reachable = false;
    const { user } = renderApp('', { signedIn: false });
    await signInWith(user, 'maria@test.dev', 'password123');
    await tick(7000);
    expect(screen.getByText(BLOCKED_MSG)).toBeTruthy();
    expect(submit().disabled).toBe(false);
  });

  it('signed in before: the app opens offline from the saved session, even with an expired token', async () => {
    offline(true);
    renderApp('piano');
    const saved = JSON.parse(localStorage.getItem(AUTH_KEY)!);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ ...saved, expires_at: 1 })); // long expired
    server.session = null; // the server can't be asked
    installSync();
    await tick(500);
    expect(gate()).toBeNull();
    expect(document.querySelector('.tabbar')).toBeTruthy();
    offline(false);
  });

  it('"نسيتي الباسورد؟" sends the link', async () => {
    const { user } = renderApp('', { signedIn: false });
    await user.type(email(), 'maria@test.dev');
    await user.click(button('نسيتي الباسورد؟'));
    await tick(500);
    expect(screen.getByText(/بعتنا لينك على إيميلك/)).toBeTruthy();
    expect(server.calls).toContain('reset');
  });
});

describe('account page and sync', () => {
  it('shows who is signed in and syncs this device to the server', async () => {
    addResult('match', 70, '7/10');
    const { user } = renderApp('account');
    expect(screen.getByText(TEST_USER.email)).toBeTruthy();
    await user.click(button(/زامني دلوقتي/));
    await tick(500);
    expect(server.rows.has('soty.v1')).toBe(true);
    expect(screen.getByText(/آخر مزامنة/)).toBeTruthy();
  });

  it('regression (sync mid-exercise): a change during an exercise waits until it ends', async () => {
    installSync();
    const { user } = renderApp('account');
    await user.click(button(/زامني دلوقتي/));
    await tick(500);
    const before = server.calls.filter((c) => c === 'putDocs').length;
    lifecycle.setBusy('mic', true);
    addResult('match', 90, '9/10');
    await tick(30000);
    expect(server.calls.filter((c) => c === 'putDocs').length).toBe(before);
    lifecycle.setBusy('mic', false);
    await tick(30000);
    expect(server.calls.filter((c) => c === 'putDocs').length).toBeGreaterThan(before);
  });

  it('a failed sync shows a calm message and retries by itself', async () => {
    const { user } = renderApp('account');
    server.failNext = 1;
    await user.click(button(/زامني دلوقتي/));
    await tick(500);
    expect(screen.getByText(/المزامنة موقفة دلوقتي/)).toBeTruthy();
    await user.click(button(/زامني دلوقتي/));
    await tick(500);
    expect(screen.getByText(/آخر مزامنة/)).toBeTruthy();
  });

  it('deleting the server data asks first, then empties the server but keeps this device', async () => {
    addResult('match', 70, '7/10');
    const { user } = renderApp('account');
    await user.click(button(/زامني دلوقتي/));
    await tick(500);
    await user.click(button('امسحي بياناتي من السيرفر'));
    await user.click(button('لأ'));
    expect(server.rows.size).toBeGreaterThan(0);
    await user.click(button('امسحي بياناتي من السيرفر'));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'أيوه امسحيها' }));
    await tick(500);
    expect(server.rows.size).toBe(0);
    expect(getResults()).toHaveLength(1);
  });
});

describe('signing out', () => {
  it('asks first; "أيوه" syncs, then removes her data from this phone and goes back to the sign-in', async () => {
    addResult('match', 70, '7/10');
    const s = normalizeSong({ title: 'أغنية' });
    await saveSongFile({ songId: s.id, name: 'a.mp3', type: 'audio/mpeg', bytes: new Uint8Array(10).buffer });
    s.file = { name: 'a.mp3', type: 'audio/mpeg', size: 10 };
    saveSongs([s]);
    const { user } = renderApp('account');
    await user.click(button('اخرجي من الحساب'));
    await tick(50);
    const box = screen.getByRole('alertdialog', { name: 'تأكيد الخروج' });
    expect(box.textContent).toMatch(/هنمسحها من الجهاز ده/);
    expect(box.textContent).not.toMatch(/هتضيع/); // everything is synced
    await user.click(within(box).getByRole('button', { name: 'لأ' }));
    expect(getResults()).toHaveLength(1);
    await user.click(button('اخرجي من الحساب'));
    await tick(50);
    await user.click(button('أيوه، زامني واخرجي'));
    await tick(3000);
    // on the server first…
    expect(JSON.parse(server.rows.get('soty.v1')!.value).results).toHaveLength(1);
    expect(server.files.size).toBe(1);
    // …then gone from this phone
    expect(getResults()).toHaveLength(0);
    expect(getSongs()).toHaveLength(0);
    expect(await listSongFiles()).toHaveLength(0);
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('soty.'))).toEqual([]);
    expect(browser.reload).toHaveBeenCalled();
    expect(gate()).toBeTruthy();
  });

  it('names the files that live only on this phone and offers a backup first', async () => {
    setPref('sync.audio', '0'); // audio sync off: song files stay here
    const s = normalizeSong({ title: 'أغنية مش متزامنة' });
    await saveSongFile({ songId: s.id, name: 'a.mp3', type: 'audio/mpeg', bytes: new Uint8Array(10).buffer });
    s.file = { name: 'a.mp3', type: 'audio/mpeg', size: 10 };
    saveSongs([s]);
    const { user } = renderApp('account');
    await user.click(button('اخرجي من الحساب'));
    await tick(50);
    const box = screen.getByRole('alertdialog', { name: 'تأكيد الخروج' });
    expect(box.textContent).toMatch(/هتضيع/);
    expect(box.textContent).toMatch(/أغنية مش متزامنة/);
    const backup = within(box).getByRole('link', { name: 'صدّري نسخة احتياطية الأول' });
    await user.click(backup);
    await tick(50);
    expect(window.location.hash).toBe('#/more');
    expect((screen.getByText('بياناتك ونسخة احتياطية').closest('details') as HTMLDetailsElement).open).toBe(true);
  });

  it('if the sync fails it does not sign out and wipes nothing', async () => {
    addResult('match', 70, '7/10');
    const { user } = renderApp('account');
    await user.click(button('اخرجي من الحساب'));
    await tick(50);
    server.failNext = 5;
    await user.click(button('أيوه، زامني واخرجي'));
    await tick(3000);
    expect(screen.getByText(SIGN_OUT_SYNC_FAILED)).toBeTruthy();
    expect(getResults()).toHaveLength(1);
    expect(gate()).toBeNull();
  });

  it('signing back in brings everything back from the server', async () => {
    server.rows.set('soty.v1', { key: 'soty.v1', value: JSON.stringify({ results: [{ type: 'sustain', value: 9, date: '2026-11-14', ts: 1 }] }), updated_at: server.tick() });
    server.users.push({ id: 'u9', email: 'back@test.dev', password: 'password123' });
    const { user } = renderApp('', { signedIn: false });
    await signInWith(user, 'back@test.dev', 'password123');
    expect(getResults().map((r) => r.value)).toEqual([9]);
  });
});

describe('password recovery page', () => {
  it('with a valid link: new password, saved, then back to the app', async () => {
    signedOut();
    server.users.push({ id: 'u1', email: 'maria@test.dev', password: 'oldpassword1' });
    server.session = { user: { id: 'u1', email: 'maria@test.dev' } };
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
    render(<RecoveryPage landing={{ kind: 'recovery' }} />);
    await tick(100);
    await user.type(screen.getByLabelText(/الباسورد الجديد/), 'newpassword1');
    await user.type(screen.getByLabelText('اكتبيه تاني'), 'newpassword1');
    await user.click(screen.getAllByRole('button').find((b) => b.className.includes('big primary'))!);
    await tick(500);
    expect(screen.getByText('✔ الباسورد اتغيّر.')).toBeTruthy();
    expect(server.users[0].password).toBe('newpassword1');
    await user.click(button('افتحي التطبيق'));
    expect(browser.reload).toHaveBeenCalled();
  });

  it('an expired link explains and offers to open the app', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
    render(<RecoveryPage landing={{ kind: 'error', message: 'اللينك ده خلص' }} />);
    expect(screen.getByText('اللينك ده خلص')).toBeTruthy();
    await user.click(button('افتحي التطبيق'));
  });
});

