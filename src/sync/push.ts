// Reminders by Web Push. The phone shows them even when the app is closed; the Supabase Edge Function "send-reminders"
// decides when (supabase/functions/send-reminders/decide.ts). Here: whether this device can get them, turning them
// on and off, and keeping two small things on the server: this device's subscription, and one row of reminder
// settings with what the server needs to decide (time zone, times, last workout, streak, weekly check date).
// iOS: only in the app opened from its home-screen icon (iOS 16.4 or later).

import { VAPID_PUBLIC_KEY } from '../config/push';
import { getPath, getPref, setPref, voiceResultDates } from '../lib/storage';
import { getGender } from '../lib/gender';
import { countedWorkouts, shiftDay, streak, usableMeasurements } from '../lib/path';
import { supabaseClient } from './account';

export type PushSupport = 'ok' | 'unsupported' | 'install-first';
export type PushState = 'unsupported' | 'install-first' | 'denied' | 'off' | 'on';

export interface ReminderSettings {
  daily_on: boolean;
  daily_time: string;
  streak_on: boolean;
  streak_time: string;
  weekly_on: boolean;
}

export const DEFAULT_SETTINGS: ReminderSettings = { daily_on: true, daily_time: '19:00', streak_on: true, streak_time: '21:00', weekly_on: true };

const ON_KEY = 'push.on';
const SETTINGS_KEY = 'push.settings';

export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);

/** Can this device get reminders? On iPhone only once the app is opened from its home-screen icon. */
export function pushSupport(): PushSupport {
  if (isIOS() && !isStandalone()) return 'install-first';
  if (!('serviceWorker' in navigator) || typeof window.PushManager === 'undefined' || typeof window.Notification === 'undefined') return 'unsupported';
  return 'ok';
}

export function pushState(): PushState {
  const s = pushSupport();
  if (s !== 'ok') return s;
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && getPref(ON_KEY) === '1' ? 'on' : 'off';
}

export function getReminderSettings(): ReminderSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(getPref(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** "BMEu…" (base64url) → the bytes pushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

/** What the server needs from her practice: her last voice workout (local date), the streak as of then, the weekly check date. */
export function practiceState(): { last_workout_date: string | null; streak: number; weekly_due_date: string | null } {
  const p = usableMeasurements(getPath());
  const days = countedWorkouts(p.workouts, voiceResultDates()).map((w) => w.date).sort();
  const last = days.at(-1) ?? null;
  const lastMeasure = p.weekly.length ? p.weekly[p.weekly.length - 1].date : (p.baseline?.date ?? null);
  return { last_workout_date: last, streak: last ? streak(days, last) : 0, weekly_due_date: lastMeasure ? shiftDay(lastMeasure, 7) : null };
}

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** The reminder row on the server (only while reminders are on). Called after a workout, a measurement, a settings change. */
export async function saveReminderState(): Promise<void> {
  if (getPref(ON_KEY) !== '1') return;
  try {
    const sb = await supabaseClient();
    const { error } = await sb.from('notification_prefs').upsert({ tz: timezone(), gender: getGender(), ...getReminderSettings(), ...practiceState(), updated_at: new Date().toISOString() });
    if (error) throw error;
  } catch {
    // offline or not set up: the next change (or the next start) sends it again
  }
}

export async function setReminderSettings(s: ReminderSettings) {
  setPref(SETTINGS_KEY, JSON.stringify(s));
  await saveReminderState();
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, no) => setTimeout(() => no(new Error('no service worker')), 8000))]);
  return reg;
}

async function saveSubscription(sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const sb = await supabaseClient();
  const { error } = await sb
    .from('push_subscriptions')
    .upsert({ endpoint: j.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', device: navigator.userAgent.slice(0, 190), updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export const PUSH_ERRORS = {
  denied: 'التنبيهات مقفولة للتطبيق. افتحي إعدادات الآيفون ← التنبيهات ← صوتي ← اسمحي بالتنبيهات، وبعدين ارجعي هنا.',
  failed: 'معرفناش نشغّل التنبيهات دلوقتي. اتأكدي من النت وجربي تاني.',
};

/** "فعّلي التنبيهات" (inside a tap): permission, subscription, saved on the server. */
export async function enablePush(): Promise<{ state: PushState; error?: string }> {
  const support = pushSupport();
  if (support !== 'ok') return { state: support };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { state: permission === 'denied' ? 'denied' : 'off', error: permission === 'denied' ? PUSH_ERRORS.denied : undefined };
  try {
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    await saveSubscription(sub);
    setPref(ON_KEY, '1');
    await saveReminderState();
    return { state: 'on' };
  } catch {
    return { state: 'off', error: PUSH_ERRORS.failed };
  }
}

/** Off on this device: the subscription is removed from the server and from the phone. */
export async function disablePush(): Promise<void> {
  setPref(ON_KEY, '0');
  await removeThisDevice();
}

/** At sign-out (and when turned off): this device stops getting her reminders. */
export async function removeThisDevice(): Promise<void> {
  if (pushSupport() !== 'ok') return;
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    try {
      const sb = await supabaseClient();
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    } catch {
      // the server drops it by itself once the push service says it's gone
    }
    await sub.unsubscribe();
  } catch {
    // no service worker: nothing subscribed here
  }
}

/** At start: the phone may have renewed the subscription; keep the server's copy and the reminder row current. */
export async function refreshPush(): Promise<void> {
  if (pushState() !== 'on') return;
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return void setPref(ON_KEY, '0');
    await saveSubscription(sub);
    await saveReminderState();
  } catch {
    // offline: next time
  }
}

/** "جربي تنبيه دلوقتي": shown by this phone right away, the same way a reminder is shown. */
export async function testNotification(): Promise<boolean> {
  try {
    const reg = await registration();
    await reg.showNotification('صوتي', { body: '🎤 كده التنبيهات شغالة', icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'test', data: { url: '#/' } });
    return true;
  } catch {
    return false;
  }
}

