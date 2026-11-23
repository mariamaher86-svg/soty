// The reminder decisions: the same file the Supabase Edge Function runs (supabase/functions/send-reminders/decide.ts).
import { describe, expect, it } from 'vitest';
import { dueDate, dueReminders, localTime, parseTime, previousDay, reminderText, type ReminderPrefs } from '../../supabase/functions/send-reminders/decide';
import pasteRaw from '../../supabase/functions/send-reminders/paste-in-dashboard.ts?raw';
import decideRaw from '../../supabase/functions/send-reminders/decide.ts?raw';
import indexRaw from '../../supabase/functions/send-reminders/index.ts?raw';

// compare text, not line endings (a Windows checkout gives the sources CRLF; the generated file is always LF)
const CR = String.fromCharCode(13);
const unix = (s: string) => s.split(CR + '\n').join('\n').split(CR).join('\n');
const paste = unix(pasteRaw);
const decideSource = unix(decideRaw);
const indexSource = unix(indexRaw);

const base: ReminderPrefs = {
  user_id: 'u1',
  tz: 'Africa/Cairo',
  gender: 'f',
  daily_on: true,
  daily_time: '19:00',
  streak_on: true,
  streak_time: '21:00',
  weekly_on: true,
  last_workout_date: '2026-11-22',
  streak: 5,
  weekly_due_date: '2026-11-29',
};
const p = (over: Partial<ReminderPrefs> = {}) => ({ ...base, ...over });
/** Cairo is UTC+2 in November. */
const cairo = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`);
const kinds = (r: { kind: string }[]) => r.map((x) => x.kind);
const none = new Set<string>();

describe('local time', () => {
  it('reads her own clock from the time zone', () => {
    expect(localTime(new Date('2026-11-23T17:05:00Z'), 'Africa/Cairo')).toEqual({ date: '2026-11-23', minutes: 19 * 60 + 5 });
    expect(localTime(new Date('2026-11-23T17:05:00Z'), 'Asia/Tokyo')).toEqual({ date: '2026-11-24', minutes: 2 * 60 + 5 });
    expect(localTime(new Date('2026-11-23T17:05:00Z'), 'Not/AZone').minutes).toBe(17 * 60 + 5); // unknown → UTC
  });
  it('parses times and finds the day before', () => {
    expect(parseTime('07:30')).toBe(450);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('x')).toBeNull();
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
  });
  it('a window is 15 minutes from the set time; one that starts before midnight belongs to that day', () => {
    expect(dueDate(cairo('2026-11-23', '18:59'), 'Africa/Cairo', '19:00')).toBeNull();
    expect(dueDate(cairo('2026-11-23', '19:00'), 'Africa/Cairo', '19:00')).toBe('2026-11-23');
    expect(dueDate(cairo('2026-11-23', '19:14'), 'Africa/Cairo', '19:00')).toBe('2026-11-23');
    expect(dueDate(cairo('2026-11-23', '19:15'), 'Africa/Cairo', '19:00')).toBeNull();
    expect(dueDate(cairo('2026-11-24', '00:05'), 'Africa/Cairo', '23:55')).toBe('2026-11-23');
  });
});

describe('daily reminder', () => {
  it('at her time, in her zone', () => {
    const r = dueReminders(p({ last_workout_date: '2026-11-22' }), cairo('2026-11-23', '19:03'), none);
    expect(kinds(r)).toEqual(['daily']);
    expect(r[0].body).toBe('🎤 وقت تمرين النهارده — ١٠ دقايق بس');
    expect(r[0].url).toBe('#/path');
    // the same moment is 02:03 in Tokyo: nothing
    expect(dueReminders(p({ tz: 'Asia/Tokyo' }), cairo('2026-11-23', '19:03'), none)).toEqual([]);
  });
  it('not when today’s workout is already done, not when off, not twice', () => {
    expect(dueReminders(p({ last_workout_date: '2026-11-23' }), cairo('2026-11-23', '19:03'), none)).toEqual([]);
    expect(dueReminders(p({ daily_on: false }), cairo('2026-11-23', '19:03'), none)).toEqual([]);
    expect(dueReminders(p(), cairo('2026-11-23', '19:03'), new Set(['daily|2026-11-23']))).toEqual([]);
  });
  it('the weekly check replaces it on the day it becomes due, once', () => {
    const r = dueReminders(p({ weekly_due_date: '2026-11-23' }), cairo('2026-11-23', '19:00'), none);
    expect(kinds(r)).toEqual(['weekly']);
    expect(r[0].body).toBe('📏 وقت القياس الأسبوعي');
    expect(dueReminders(p({ weekly_due_date: '2026-11-23' }), cairo('2026-11-23', '19:05'), new Set(['weekly|2026-11-23']))).toEqual([]);
    expect(kinds(dueReminders(p({ weekly_due_date: '2026-11-23', weekly_on: false }), cairo('2026-11-23', '19:00'), none))).toEqual(['daily']);
    expect(kinds(dueReminders(p({ weekly_due_date: '2026-11-22' }), cairo('2026-11-23', '19:00'), none))).toEqual(['daily']); // only on the day
  });
});

describe('streak at risk', () => {
  it('in the evening when the streak is 2 or more and today has no workout', () => {
    const r = dueReminders(p({ streak: 5, last_workout_date: '2026-11-22' }), cairo('2026-11-23', '21:10'), none);
    expect(kinds(r)).toEqual(['streak']);
    expect(r[0].body).toBe('🔥 لسه ما اتمرنتيش النهارده — متضيعيش الـ٥ أيام ورا بعض');
  });
  it('not under 2, not when today is done, not when the streak already broke', () => {
    expect(dueReminders(p({ streak: 1 }), cairo('2026-11-23', '21:00'), none)).toEqual([]);
    expect(dueReminders(p({ last_workout_date: '2026-11-23' }), cairo('2026-11-23', '21:00'), none)).toEqual([]);
    expect(dueReminders(p({ last_workout_date: '2026-11-20' }), cairo('2026-11-23', '21:00'), none)).toEqual([]);
    expect(dueReminders(p({ streak_on: false }), cairo('2026-11-23', '21:00'), none)).toEqual([]);
  });
  it('never on top of the daily reminder in the same hour', () => {
    expect(kinds(dueReminders(p({ daily_time: '21:00', streak_time: '21:00' }), cairo('2026-11-23', '21:00'), none))).toEqual(['daily']);
    expect(dueReminders(p({ daily_time: '20:30', streak_time: '21:00' }), cairo('2026-11-23', '21:00'), new Set(['daily|2026-11-23']))).toEqual([]);
    expect(kinds(dueReminders(p({ daily_time: '19:00', streak_time: '21:00' }), cairo('2026-11-23', '21:00'), new Set(['daily|2026-11-23'])))).toEqual(['streak']);
  });
  it('near midnight it belongs to the right day', () => {
    const r = dueReminders(p({ streak_time: '23:55', last_workout_date: '2026-11-22' }), cairo('2026-11-24', '00:05'), none);
    expect(r).toEqual([expect.objectContaining({ kind: 'streak', date: '2026-11-23' })]);
  });
  it('the wording follows girl or boy, and counts in Arabic', () => {
    expect(reminderText('streak', 'm', 2).body).toBe('🔥 لسه ما اتمرنتش النهارده — متضيعش اليومين ورا بعض');
    expect(reminderText('streak', 'f', 12).body).toContain('الـ١٢ يوم');
  });
});

describe('the function file she pastes', () => {
  it('is index.ts with decide.ts inlined, up to date (run `npm run reminders` after editing either)', () => {
    const code = (s: string) => s.split('\n').filter((l) => !l.startsWith('//')).join('\n').replace(/^export /gm, '').trim();
    expect(paste).toContain(code(decideSource));
    for (const line of indexSource.split('\n').filter((l) => l.trim() && !l.includes("from './decide.ts'"))) expect(paste, line).toContain(line);
    expect(paste).not.toMatch(/from '\.\/decide\.ts'/);
    expect(pasteRaw).not.toContain(CR); // the file she pastes is the exact single-file version
  });
  it('checks the cron secret first and never contains a key', () => {
    expect(indexSource.indexOf("x-cron-secret")).toBeLessThan(indexSource.indexOf('SUPABASE_SERVICE_ROLE_KEY'));
    expect(paste).not.toMatch(/-----BEGIN|sb_secret_|eyJhbGciOi/);
  });
});
