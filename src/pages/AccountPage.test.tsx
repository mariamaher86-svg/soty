// Account (sign up, sign in, errors, offline), sync against the fake Supabase, and the password-recovery page.
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { button, renderApp, tick } from '../test/app';
import { server } from '../test/fakeSupabase';
import { addResult, getResults } from '../lib/storage';
import { lifecycle } from '../lib/lifecycle';
import { installSync, signOut } from '../sync/account';
import { RecoveryPage } from './RecoveryPage';
import { BLOCKED_MSG, OFFLINE_MSG } from '../lib/auth';
import { browser } from '../lib/reload';

const email = () => screen.getByLabelText('إيميلك') as HTMLInputElement;
const password = () => screen.getAllByLabelText(/باسورد|الباسورد/)[0] as HTMLInputElement;
const submit = () => document.querySelector('form button[type="submit"]') as HTMLButtonElement;
const modeChip = (name: string) => within(screen.getByRole('group', { name: 'دخول أو حساب جديد' })).getByRole('button', { name });

async function signUp(user: ReturnType<typeof renderApp>['user'], mail = 'maria@test.dev', pass = 'password123') {
  await user.click(modeChip('إنشاء حساب'));
  await user.type(email(), mail);
  await user.type(password(), pass);
  await user.type(screen.getByLabelText(/اكتبي|تأكيد|تاني/), pass);
  await user.click(submit());
  await tick(5000);
}

describe('account and sync', () => {
  it('sign up: the button waits for a valid form; then she is signed in and this device is sent to the server', async () => {
    addResult('match', 70, '7/10');
    const { user } = renderApp('account');
    await user.click(modeChip('إنشاء حساب'));
    await user.type(email(), 'maria@test.dev');
    await user.type(password(), 'short');
    expect(submit().disabled).toBe(true);
    await user.clear(password());
    await user.clear(email());
    await signUp(user);
    expect(screen.getByText('maria@test.dev')).toBeTruthy();
    expect(server.rows.has('soty.v1')).toBe(true);
    expect(screen.getByText(/آخر مزامنة/)).toBeTruthy();
    await user.click(button('اخرجي من الحساب'));
    await tick(50);
    expect(modeChip('دخول')).toBeTruthy();
  });

  it('a wrong password says so in Arabic; the right one brings the other device’s results', async () => {
    server.users.push({ id: 'u9', email: 'maria@test.dev', password: 'password123' });
    server.rows.set('soty.v1', { key: 'soty.v1', value: JSON.stringify({ results: [{ type: 'sustain', value: 9, date: '2026-11-14', ts: 1 }] }), updated_at: server.tick() });
    const { user } = renderApp('account');
    await user.type(email(), 'maria@test.dev');
    await user.type(password(), 'wrongpass1');
    await user.click(submit());
    await tick(500);
    expect(document.querySelector('.error')!.textContent).toMatch(/[؀-ۿ]/);
    await user.clear(password());
    await user.type(password(), 'password123');
    await user.click(submit());
    await tick(5000);
    expect(getResults().some((r) => r.type === 'sustain' && r.value === 9)).toBe(true);
    await signOut();
  });

  it('an existing email on sign-up is refused', async () => {
    server.users.push({ id: 'u1', email: 'maria@test.dev', password: 'password123' });
    const { user } = renderApp('account');
    await signUp(user);
    expect(document.querySelector('.error')).toBeTruthy();
    expect(server.session).toBeNull();
  });

  it('offline and a blocked network each say what is going on, without hanging', async () => {
    const { user } = renderApp('account');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await user.type(email(), 'maria@test.dev');
    await user.type(password(), 'password123');
    await user.click(submit());
    await tick(500);
    expect(screen.getByText(OFFLINE_MSG)).toBeTruthy();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    server.reachable = false;
    await user.click(submit());
    await tick(7000);
    expect(screen.getByText(BLOCKED_MSG)).toBeTruthy();
    expect(submit().disabled).toBe(false);
  });

  it('"نسيتي الباسورد؟" sends the link', async () => {
    const { user } = renderApp('account');
    await user.type(email(), 'maria@test.dev');
    await user.click(button('نسيتي الباسورد؟'));
    await tick(500);
    expect(screen.getByText(/بعتنا لينك على إيميلك/)).toBeTruthy();
    expect(server.calls).toContain('reset');
  });

  it('regression (sync mid-exercise): a change during an exercise waits until it ends', async () => {
    installSync();
    const { user } = renderApp('account');
    await signUp(user);
    const before = server.calls.filter((c) => c === 'putDocs').length;
    lifecycle.setBusy('mic', true);
    addResult('match', 90, '9/10');
    await tick(30000);
    expect(server.calls.filter((c) => c === 'putDocs').length).toBe(before);
    lifecycle.setBusy('mic', false);
    await tick(30000);
    expect(server.calls.filter((c) => c === 'putDocs').length).toBeGreaterThan(before);
    await signOut();
  });

  it('a failed sync shows a calm message and retries by itself', async () => {
    const { user } = renderApp('account');
    await signUp(user);
    server.failNext = 1;
    await user.click(button(/زامني دلوقتي/));
    await tick(500);
    expect(screen.getByText(/المزامنة موقفة دلوقتي/)).toBeTruthy();
    await tick(31000);
    expect(screen.getByText(/آخر مزامنة/)).toBeTruthy();
    await signOut();
  });

  it('deleting the server data asks first, then empties the server but keeps this device', async () => {
    addResult('match', 70, '7/10');
    const { user } = renderApp('account');
    await signUp(user);
    await user.click(screen.getAllByRole('button').find((b) => b.className.includes('danger'))!);
    await user.click(button('لأ'));
    expect(server.rows.size).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button').find((b) => b.className.includes('danger'))!);
    await user.click(screen.getByRole('alertdialog').querySelector('button') as HTMLElement);
    await tick(500);
    expect(server.rows.size).toBe(0);
    expect(getResults()).toHaveLength(1);
    await signOut();
  });
});

describe('password recovery page', () => {
  it('with a valid link: new password, saved, then back to the app', async () => {
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
