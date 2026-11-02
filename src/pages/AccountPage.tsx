import { useState } from 'react';
import { ErrorText, Page } from '../components/ui';
import { deleteServerData, sendCode, signOut, syncNow, useAccount, verifyCode } from '../sync/account';
import { FREE_STORAGE_BYTES, normalizeOtp, validEmail } from '../lib/sync';
import { mb } from '../audio/songFiles';
import { getPref, setPref } from '../lib/storage';
import { g } from '../lib/gender';

const when = (ms: number) => new Date(ms).toLocaleString('ar-EG', { weekday: 'long', hour: 'numeric', minute: '2-digit' });

/** "👤 حسابي" (under المزيد): optional email-code sign-in, so the data also lives in her own Supabase project. */
export function AccountPage() {
  const a = useAccount();
  const [email, setEmail] = useState(() => getPref('sync.email') ?? '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [audio, setAudio] = useState(() => getPref('sync.audio') !== '0');

  if (!a.configured)
    return (
      <Page help="account" title="👤 حسابي">
        <div className="panel">
          <p>المزامنة لسه متجهزتش في النسخة دي من التطبيق.</p>
          <p className="hint">كل حاجة شغالة عادي على الجهاز ده. عشان تشغّليها: خطوات Supabase في ملف README (الجزء "حسابي والمزامنة").</p>
        </div>
      </Page>
    );

  const run = async (f: () => Promise<string | null>) => {
    setBusy(true);
    setErr('');
    const e = await f();
    setBusy(false);
    if (e) setErr(e);
    return !e;
  };

  if (!a.user)
    return (
      <Page help="account" title="👤 حسابي" intro="اختياري: بإيميلك، بياناتك بتتحفظ كمان في السيرفر بتاعك وتتزامن بين الموبايل واللابتوب.">
        <div className="panel">
          {step === 'email' ? (
            <>
              <label className="field">
                <span>إيميلك</span>
                <input type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </label>
              <button
                className="big primary"
                disabled={busy || !validEmail(email)}
                onClick={() =>
                  void run(async () => {
                    setPref('sync.email', email.trim());
                    const e = await sendCode(email);
                    if (!e) setStep('code');
                    return e;
                  })
                }
              >
                {busy ? '…' : 'ابعتيلي كود'}
              </button>
            </>
          ) : (
            <>
              <p>
                بعتنا كود من ٦ أرقام على <b dir="ltr">{email}</b>. اكتبيه هنا (من غير ما تفتحي أي لينك).
              </p>
              <label className="field">
                <span>الكود</span>
                <input className="otp" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </label>
              <button className="big primary" disabled={busy || !normalizeOtp(code)} onClick={() => void run(() => verifyCode(email, normalizeOtp(code)!))}>
                {busy ? '…' : 'ادخلي'}
              </button>
              <div className="row">
                <button className="link" disabled={busy} onClick={() => void run(() => sendCode(email))}>
                  ابعتي كود تاني
                </button>
                <button className="link" disabled={busy} onClick={() => setStep('email')}>
                  غيّري الإيميل
                </button>
              </div>
            </>
          )}
          <ErrorText text={err} />
          {a.message && <p className="warn-text">{a.message}</p>}
        </div>
        <p className="hint">من غير حساب كل حاجة شغالة عادي على الجهاز ده بس.</p>
      </Page>
    );

  const s = a.summary;
  return (
    <Page help="account" title="👤 حسابي">
      <div className="panel">
        <p>
          {g('داخلة', 'داخل')} بـ <b dir="ltr">{a.user.email}</b>
        </p>
        <p className={a.phase === 'error' ? 'warn-text' : 'hint'} role="status">
          {a.phase === 'syncing'
            ? a.files
              ? `بنزامن ملفات الصوت… ${a.files.done} من ${a.files.total}`
              : 'بنزامن…'
            : a.phase === 'error'
              ? a.message
              : a.lastSync
                ? `آخر مزامنة: ${when(a.lastSync)}`
                : 'لسه متزامنتش.'}
        </p>
        {s && (s.newResults > 0 || s.newSongs > 0 || s.merged > 0) && (
          <p className="ok-text">
            ✔ اتجمعت بيانات الجهاز ده مع السيرفر{s.newResults ? ` — ${s.newResults} نتيجة جديدة` : ''}
            {s.newSongs ? `، ${s.newSongs} أغنية جديدة` : ''}. مفيش حاجة اتمسحت.
          </p>
        )}
        {a.message && a.phase !== 'error' && <p className="ok-text">{a.message}</p>}
        <button className="big primary" disabled={a.phase === 'syncing'} onClick={() => void syncNow().catch(() => {})}>
          🔄 زامني دلوقتي
        </button>
      </div>

      <div className="panel">
        <h2>ملفات الصوت</h2>
        <label className="check-row">
          <input
            type="checkbox"
            checked={audio}
            onChange={(e) => {
              setAudio(e.target.checked);
              setPref('sync.audio', e.target.checked ? '1' : '0');
            }}
          />
          زامني ملفات الصوت (تسجيلات المعلم، "دو ري مي"، ملفات الأغاني وأصوات الكورال)
        </label>
        <p className="hint">اقفليها لو على باقة موبايل. النتايج والإعدادات بتتزامن في الحالتين.</p>
        {a.filesBytes !== null && (
          <>
            <div className="usage" role="img" aria-label="المساحة المستخدمة">
              <span style={{ width: `${Math.min(100, (a.filesBytes / FREE_STORAGE_BYTES) * 100)}%` }} />
            </div>
            <p className="hint">
              مستخدم {mb(a.filesBytes)} من ١ جيجا (المجاني).
            </p>
          </>
        )}
      </div>

      <div className="panel">
        <div className="row">
          <button onClick={() => void signOut()}>اخرجي من الحساب</button>
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            امسحي بياناتي من السيرفر
          </button>
        </div>
        <p className="hint">الخروج ومسح السيرفر الاتنين مش بيمسحوا حاجة من الجهاز ده.</p>
        {confirmDelete && (
          <div className="confirm-box" role="alertdialog" aria-label="تأكيد مسح بيانات السيرفر">
            <p>
              هنمسح كل نتايجك وإعداداتك وملفات الصوت من <b>السيرفر</b>. اللي على الجهاز ده هيفضل زي ما هو، ولو {g('فضلتي داخلة', 'فضلت داخل')} هيترفع تاني في المزامنة الجاية.
            </p>
            <div className="row">
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const e = await deleteServerData();
                    setConfirmDelete(false);
                    return e;
                  })
                }
              >
                أيوه امسحيها
              </button>
              <button onClick={() => setConfirmDelete(false)}>لأ</button>
            </div>
          </div>
        )}
        <ErrorText text={err} />
      </div>
    </Page>
  );
}
