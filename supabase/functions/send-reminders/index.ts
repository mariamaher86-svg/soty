// Supabase Edge Function "send-reminders" (Deno). Called every 15 minutes by pg_cron (see supabase/notifications.sql)
// with the x-cron-secret header. For each person: which reminder is due in her own time zone (decide.ts, the same code
// the app's tests check), written to notification_log first so nothing is sent twice, then sent by Web Push to each of
// her devices. Subscriptions the push service says are gone (404/410) are deleted.
//
// Secrets (Edge Functions → Secrets): CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (the app's https address;
// no email is used).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically. "Verify JWT" must be OFF.
//
// To paste into the dashboard editor, use paste-in-dashboard.ts (this file with decide.ts inlined; `npm run reminders`).

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { dueReminders, localTime, previousDay, type ReminderPrefs } from './decide.ts';

/** Who sends the pushes, for the push services: the app's address (the spec allows an https URL instead of an email). */
const SUBJECT = 'https://mariamaher86-svg.github.io/soty/';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || SUBJECT, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

  const now = new Date();
  const { data: prefs, error } = await sb.from('notification_prefs').select('*');
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let removed = 0;
  for (const p of (prefs ?? []) as ReminderPrefs[]) {
    // what already went out today or yesterday (a window can start before her midnight)
    const today = localTime(now, p.tz).date;
    const { data: log } = await sb.from('notification_log').select('kind, local_date').eq('user_id', p.user_id).in('local_date', [today, previousDay(today)]);
    const already = new Set((log ?? []).map((r: { kind: string; local_date: string }) => `${r.kind}|${r.local_date}`));
    const due = dueReminders(p, now, already);
    if (!due.length) continue;

    const { data: subs } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', p.user_id);
    for (const r of due) {
      // claim it first: the unique key (user, kind, local date) means a second run can't send it again
      const { error: dup } = await sb.from('notification_log').insert({ user_id: p.user_id, kind: r.kind, local_date: r.date });
      if (dup) continue;
      const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.kind });
      for (const s of (subs ?? []) as { endpoint: string; p256dh: string; auth: string }[]) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 6, urgency: 'normal' });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
            removed++;
          }
        }
      }
    }
  }
  return json({ ok: true, people: prefs?.length ?? 0, sent, removed });
});
