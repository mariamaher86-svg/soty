// "🔔 التنبيهات" (under المزيد): turn reminders on from a tap, choose which and when, send a test.

import { useState } from 'react';
import { ErrorText, Page } from '../components/ui';
import { g } from '../lib/gender';
import { disablePush, enablePush, getReminderSettings, pushState, setReminderSettings, testNotification, type PushState, type ReminderSettings } from '../sync/push';

export function NotificationsPage() {
  const [state, setState] = useState<PushState>(pushState);
  const [settings, setSettings] = useState<ReminderSettings>(getReminderSettings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tested, setTested] = useState<boolean | null>(null);

  const change = (patch: Partial<ReminderSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void setReminderSettings(next);
  };
  const turnOn = async () => {
    setBusy(true);
    setErr('');
    const r = await enablePush();
    setState(r.state);
    if (r.error) setErr(r.error);
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setState(pushState());
    setBusy(false);
  };

  return (
    <Page title="🔔 التنبيهات" intro="تذكير بتمرين النهارده، وقبل ما الأيام ورا بعض تضيع، ووقت القياس الأسبوعي.">
      <div className="panel center">
        {state === 'install-first' && (
          <>
            <p>
              <b>افتحي التطبيق من الأيقونة الأول.</b>
            </p>
            <p className="hint">على الآيفون التنبيهات بتشتغل بس في التطبيق اللي على الشاشة الرئيسية (Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية)، مش جوه Safari.</p>
          </>
        )}
        {state === 'unsupported' && <p>الموبايل أو المتصفح ده مش بيدعم التنبيهات. على الآيفون محتاجة iOS 16.4 أو أحدث.</p>}
        {state === 'denied' && (
          <>
            <p>
              <b>التنبيهات مقفولة.</b>
            </p>
            <p className="hint">عشان ترجّعيها: إعدادات الآيفون ← التنبيهات ← صوتي ← اسمحي بالتنبيهات. وبعدين ارجعي هنا ودوسي «فعّلي التنبيهات».</p>
            <button className="big primary" disabled={busy} onClick={() => void turnOn()}>
              فعّلي التنبيهات
            </button>
          </>
        )}
        {state === 'off' && (
          <>
            <p>التنبيهات مقفولة على الجهاز ده.</p>
            <button className="big primary" disabled={busy} onClick={() => void turnOn()}>
              {busy ? '…' : 'فعّلي التنبيهات'}
            </button>
            <p className="hint">الموبايل هيسألك: دوسي «Allow» أو «سماح».</p>
          </>
        )}
        {state === 'on' && (
          <>
            <p className="ok-text">✔ التنبيهات شغالة على الجهاز ده.</p>
            <div className="row">
              <button
                className="primary"
                onClick={() => {
                  setTested(null);
                  void testNotification().then(setTested);
                }}
              >
                جربي تنبيه دلوقتي
              </button>
              <button disabled={busy} onClick={() => void turnOff()}>
                اقفلي التنبيهات
              </button>
            </div>
            {tested === true && <p className="hint">لو {g('شوفتي', 'شوفت')} التنبيه فوق، كله تمام.</p>}
            {tested === false && <p className="error">التنبيه ما ظهرش. افتحي التطبيق من الأيقونة وجربي تاني.</p>}
          </>
        )}
        <ErrorText text={err} />
      </div>

      {state === 'on' && (
        <div className="panel reminder-settings">
          <Reminder label="تذكير تمرين النهارده" on={settings.daily_on} time={settings.daily_time} onToggle={(v) => change({ daily_on: v })} onTime={(t) => change({ daily_time: t })} />
          <Reminder label="لو الأيام ورا بعض هتضيع" hint="بيتبعت بس لو ما اتمرنتيش النهارده وعندك يومين ورا بعض أو أكتر." on={settings.streak_on} time={settings.streak_time} onToggle={(v) => change({ streak_on: v })} onTime={(t) => change({ streak_time: t })} />
          <Reminder label="وقت القياس الأسبوعي" hint="مرة واحدة يوم ما يجي ميعاده، في ميعاد تذكير التمرين وبداله." on={settings.weekly_on} onToggle={(v) => change({ weekly_on: v })} />
        </div>
      )}
    </Page>
  );
}

function Reminder({ label, hint, on, time, onToggle, onTime }: { label: string; hint?: string; on: boolean; time?: string; onToggle: (v: boolean) => void; onTime?: (t: string) => void }) {
  return (
    <div className="setting reminder">
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        {label}
      </label>
      {time !== undefined && onTime && (
        <label className="field reminder-time">
          <span>الساعة</span>
          <input type="time" value={time} disabled={!on} onChange={(e) => e.target.value && onTime(e.target.value)} />
        </label>
      )}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
