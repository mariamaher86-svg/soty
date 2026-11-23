// Which reminder is due for one person right now. Pure: no Deno, no browser, no imports, so the Supabase Edge Function
// (index.ts) and the app's test suite run the very same code.
//
// The cron job calls the function every 15 minutes. A reminder set for 19:00 is due in the window [19:00, 19:15) of her
// own local time (from her IANA time zone). The day it belongs to is the local date when its window started, so a
// reminder at 23:55 sent at 00:05 still counts for the day before. notification_log (one row per person, kind and local
// date) makes sure nothing is sent twice.

export type ReminderKind = 'daily' | 'streak' | 'weekly';

export interface ReminderPrefs {
  user_id: string;
  /** IANA time zone, e.g. "Africa/Cairo" */
  tz: string;
  /** 'f' or 'm': the wording */
  gender: string;
  daily_on: boolean;
  /** "HH:MM", her local time */
  daily_time: string;
  streak_on: boolean;
  streak_time: string;
  weekly_on: boolean;
  /** local date (YYYY-MM-DD) of her last voice workout */
  last_workout_date: string | null;
  /** days in a row, as of her last workout */
  streak: number;
  /** local date the weekly check becomes due */
  weekly_due_date: string | null;
}

export interface Reminder {
  kind: ReminderKind;
  /** the local day it belongs to (the dedupe key with the user and kind) */
  date: string;
  title: string;
  body: string;
  /** where tapping it opens, relative to the app */
  url: string;
}

export const WINDOW_MINUTES = 15;

/** Local date and minutes since midnight at `now` in `tz` (an unknown zone falls back to UTC). */
export function localTime(now: Date, tz: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: hour * 60 + Number(get('minute')) };
}

/** "19:30" → 1170; anything odd → null. */
export function parseTime(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** If `time` is in the current window: the local date it belongs to (the window may have started before midnight). */
export function dueDate(now: Date, tz: string, time: string): string | null {
  const t = parseTime(time);
  if (t === null) return null;
  const local = localTime(now, tz);
  const since = (local.minutes - t + 1440) % 1440;
  if (since >= WINDOW_MINUTES) return null;
  return localTime(new Date(now.getTime() - since * 60000), tz).date;
}

/** The day before a YYYY-MM-DD date. */
export function previousDay(date: string): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ar = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

/** The wording, girl or boy. */
export function reminderText(kind: ReminderKind, gender: string, streak = 0): { title: string; body: string } {
  const boy = gender === 'm';
  if (kind === 'weekly') return { title: 'صوتي', body: '📏 وقت القياس الأسبوعي' };
  if (kind === 'streak') {
    const days = streak === 2 ? 'اليومين' : streak <= 10 ? `الـ${ar(streak)} أيام` : `الـ${ar(streak)} يوم`;
    return { title: 'صوتي', body: `🔥 لسه ${boy ? 'ما اتمرنتش' : 'ما اتمرنتيش'} النهارده — ${boy ? 'متضيعش' : 'متضيعيش'} ${days} ورا بعض` };
  }
  return { title: 'صوتي', body: '🎤 وقت تمرين النهارده — ١٠ دقايق بس' };
}

/**
 * The reminders due now for one person, given the kinds already sent (`sent` holds "kind|date" keys from the log).
 *  - at the daily time: the weekly check on the day it becomes due (instead of the daily reminder), otherwise the daily
 *    reminder, unless she has already done today's workout;
 *  - at the evening time: "streak at risk" when the streak is at least 2, her last workout was yesterday (so today's is
 *    still missing), and no daily/weekly reminder went out within the hour before it.
 */
export function dueReminders(p: ReminderPrefs, now: Date, sent: Set<string>): Reminder[] {
  const out: Reminder[] = [];
  const was = (kind: ReminderKind, date: string) => sent.has(`${kind}|${date}`);
  const add = (kind: ReminderKind, date: string, url: string) => {
    if (was(kind, date)) return;
    out.push({ kind, date, url, ...reminderText(kind, p.gender, p.streak) });
  };

  const dailyDay = dueDate(now, p.tz, p.daily_time);
  if (dailyDay) {
    if (p.weekly_on && p.weekly_due_date === dailyDay) add('weekly', dailyDay, '#/path');
    else if (p.daily_on && p.last_workout_date !== dailyDay) add('daily', dailyDay, '#/path');
  }

  const streakDay = dueDate(now, p.tz, p.streak_time);
  if (streakDay && p.streak_on && p.streak >= 2 && p.last_workout_date === previousDay(streakDay)) {
    const daily = parseTime(p.daily_time);
    const evening = parseTime(p.streak_time)!;
    const sameHour = daily !== null && (evening - daily + 1440) % 1440 < 60;
    const dailyWent = out.length > 0 || was('daily', streakDay) || was('weekly', streakDay);
    if (!(sameHour && dailyWent)) add('streak', streakDay, '#/path');
  }
  return out;
}
