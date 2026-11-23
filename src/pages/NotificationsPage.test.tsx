// Reminders: the page's states, turning them on (permission, subscription, the reminder row on the server), changing
// times, turning them off, sign-out, and the test notification. Real delivery can only be tried on the phone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { button, renderApp, tick, TEST_USER } from '../test/app';
import { server } from '../test/fakeSupabase';
import { setPref, updatePath } from '../lib/storage';
import { keyBytes, practiceState, refreshPush, saveReminderState } from '../sync/push';
import { VAPID_PUBLIC_KEY } from '../config/push';

/** A phone's push setup: permission, the subscription, what it showed. */
const phone = {
  permission: 'default' as NotificationPermission,
  answer: 'granted' as NotificationPermission,
  sub: null as null | { endpoint: string; options: PushSubscriptionOptionsInit; unsubscribed: boolean },
  shown: [] as { title: string; options: NotificationOptions }[],
  endpoints: 0,
};

function fakeSubscription(options: PushSubscriptionOptionsInit) {
  const s = { endpoint: `https://push.example/e${++phone.endpoints}`, options, unsubscribed: false };
  phone.sub = s;
  return {
    endpoint: s.endpoint,
    toJSON: () => ({ endpoint: s.endpoint, keys: { p256dh: 'BPkey' + phone.endpoints, auth: 'auth' + phone.endpoints } }),
    unsubscribe: async () => {
      s.unsubscribed = true;
      phone.sub = null;
      return true;
    },
  };
}

const registration = {
  pushManager: {
    getSubscription: async () => (phone.sub ? fakeSubscriptionFrom(phone.sub) : null),
    subscribe: async (o: PushSubscriptionOptionsInit) => fakeSubscription(o),
  },
  showNotification: async (title: string, options: NotificationOptions) => void phone.shown.push({ title, options }),
};
function fakeSubscriptionFrom(s: NonNullable<typeof phone.sub>) {
  return {
    endpoint: s.endpoint,
    toJSON: () => ({ endpoint: s.endpoint, keys: { p256dh: 'BPkey' + phone.endpoints, auth: 'auth' + phone.endpoints } }),
    unsubscribe: async () => {
      s.unsubscribed = true;
      phone.sub = null;
      return true;
    },
  };
}

function installPushPhone({ ios = false, standalone = true } = {}) {
  // a live getter (Object.assign would copy the value once)
  const N = function () {} as unknown as { permission: NotificationPermission; requestPermission: () => Promise<NotificationPermission> };
  Object.defineProperty(N, 'permission', { get: () => phone.permission });
  N.requestPermission = async () => (phone.permission = phone.answer);
  Object.defineProperty(window, 'Notification', { configurable: true, value: N });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration), addEventListener() {} } });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15' : 'Mozilla/5.0 (Linux; Android 14)' });
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: ios ? standalone : undefined });
}

const subs = () => server.tables.push_subscriptions ?? [];
const prefsRow = () => (server.tables.notification_prefs ?? [])[0] as Record<string, unknown> | undefined;

beforeEach(() => {
  Object.assign(phone, { permission: 'default', answer: 'granted', sub: null, shown: [], endpoints: 0 });
});
afterEach(() => {
  for (const k of ['Notification', 'PushManager'] as const) delete (window as unknown as Record<string, unknown>)[k];
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
});

describe('notifications page: states', () => {
  it('not supported: says so, no button', () => {
    renderApp('notifications');
    expect(screen.getByText(/مش بيدعم التنبيهات/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'فعّلي التنبيهات' })).toBeNull();
  });

  it('iPhone in Safari (not from the icon): "افتحي التطبيق من الأيقونة الأول"', () => {
    installPushPhone({ ios: true, standalone: false });
    renderApp('notifications');
    expect(screen.getByText('افتحي التطبيق من الأيقونة الأول.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'فعّلي التنبيهات' })).toBeNull();
  });

  it('blocked: explains how to allow them again in the iPhone settings', () => {
    installPushPhone({ ios: true });
    phone.permission = 'denied';
    renderApp('notifications');
    expect(screen.getByText(/إعدادات الآيفون ← التنبيهات ← صوتي/)).toBeTruthy();
  });

  it('off: one button; from the home-screen app on iPhone too', () => {
    installPushPhone({ ios: true, standalone: true });
    renderApp('notifications');
    expect(button('فعّلي التنبيهات')).toBeTruthy();
  });

  it('reachable from المزيد', async () => {
    renderApp('more');
    expect(document.querySelector('main a[href="#/notifications"]')).toBeTruthy();
  });
});

describe('turning reminders on, changing them, turning them off', () => {
  it('"فعّلي التنبيهات": permission from the tap, a subscription with the app key, saved with her reminder row', async () => {
    installPushPhone();
    const { user } = renderApp('notifications');
    await user.click(button('فعّلي التنبيهات'));
    await tick(50);
    expect(screen.getByText(/التنبيهات شغالة/)).toBeTruthy();
    expect(new Uint8Array(phone.sub!.options.applicationServerKey as ArrayBuffer)).toEqual(keyBytes(VAPID_PUBLIC_KEY));
    expect(phone.sub!.options.userVisibleOnly).toBe(true);
    expect(subs()).toEqual([expect.objectContaining({ endpoint: 'https://push.example/e1', user_id: TEST_USER.id, p256dh: 'BPkey1', auth: 'auth1' })]);
    expect(prefsRow()).toMatchObject({ user_id: TEST_USER.id, daily_on: true, daily_time: '19:00', streak_time: '21:00', weekly_on: true, gender: 'f' });
    expect(typeof prefsRow()!.tz).toBe('string');
  });

  it('"Don\'t allow": stays off and explains', async () => {
    installPushPhone();
    phone.answer = 'denied';
    const { user } = renderApp('notifications');
    await user.click(button('فعّلي التنبيهات'));
    await tick(50);
    expect(screen.getAllByText(/إعدادات الآيفون ← التنبيهات ← صوتي/).length).toBeGreaterThan(0);
    expect(subs()).toHaveLength(0);
  });

  it('changing a time or a toggle updates her row on the server', async () => {
    installPushPhone();
    const { user } = renderApp('notifications');
    await user.click(button('فعّلي التنبيهات'));
    await tick(50);
    const time = screen.getAllByLabelText('الساعة')[0] as HTMLInputElement;
    fireEvent.change(time, { target: { value: '07:30' } }); // the phone's time wheel
    await tick(50);
    expect(prefsRow()!.daily_time).toBe('07:30');
    await user.click(screen.getByLabelText('لو الأيام ورا بعض هتضيع'));
    await tick(50);
    expect(prefsRow()!.streak_on).toBe(false);
  });

  it('after a workout the row carries her last workout, the streak and the next weekly check', async () => {
    installPushPhone();
    const { user } = renderApp('notifications');
    await user.click(button('فعّلي التنبيهات'));
    await tick(50);
    updatePath((p) => {
      p.baseline = { date: '2026-11-10', rangeLow: 50, rangeHigh: 70, matchCents: 30, matchLockSec: 2, sustainSec: 5, stabilityCents: 10, hissSec: 8 };
      p.workouts = [13, 14, 15].map((d) => ({ date: `2026-11-${d}`, maqam: 'rast', feeling: 'no' as const, done: 4 }));
    });
    await saveReminderState();
    expect(prefsRow()).toMatchObject({ last_workout_date: '2026-11-15', streak: 3, weekly_due_date: '2026-11-17' });
    expect(practiceState().streak).toBe(3);
  });

  it('a renewed subscription is saved again at start', async () => {
    installPushPhone();
    const { user } = renderApp('notifications');
    await user.click(button('فعّلي التنبيهات'));
    await tick(50);
    phone.sub = { endpoint: 'https://push.example/renewed', options: {}, unsubscribed: false };
    await refreshPush();
    expect(subs().map((s) => s.endpoint)).toContain('https://push.example/renewed');
  });

  it('"اقفلي التنبيهات": removed from the server and from the phone', async () => {
    installPushPhone();
    const { user } = renderApp('notifications');
    await user.click(button('فعّلي التنبيهات'));
    await tick(50);
    const s = phone.sub!;
    await user.click(button('اقفلي التنبيهات'));
    await tick(50);
    expect(subs()).toHaveLength(0);
    expect(s.unsubscribed).toBe(true);
    expect(button('فعّلي التنبيهات')).toBeTruthy();
  });

  it('signing out stops this phone getting her reminders', async () => {
    installPushPhone();
    const { user } = renderApp('notifications');
    await user.click(button('فعّلي التنبيهات'));
    await tick(50);
    window.location.hash = '#/account';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await tick(20);
    await user.click(button('اخرجي من الحساب'));
    await tick(50);
    await user.click(button('أيوه، زامني واخرجي'));
    await tick(3000);
    expect(subs()).toHaveLength(0);
    expect(phone.sub).toBeNull();
  });

  it('"جربي تنبيه دلوقتي" shows one on this phone, with the icon', async () => {
    installPushPhone();
    const { user } = renderApp('notifications');
    await user.click(button('فعّلي التنبيهات'));
    await tick(50);
    await user.click(button('جربي تنبيه دلوقتي'));
    await tick(50);
    expect(phone.shown).toEqual([expect.objectContaining({ title: 'صوتي', options: expect.objectContaining({ icon: './icons/icon-192.png', tag: 'test' }) })]);
    expect(screen.getByText(/لو شوفتي التنبيه/)).toBeTruthy();
  });

  it('nothing is sent to the server while reminders are off', async () => {
    setPref('push.on', '0');
    await saveReminderState();
    expect(prefsRow()).toBeUndefined();
    expect(vi.isFakeTimers()).toBe(true);
  });
});
