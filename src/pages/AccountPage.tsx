import { useState } from 'react';
import { ErrorText, Page } from '../components/ui';
import { createAccount, deleteServerData, forgotPassword, signIn, signOut, syncNow, useAccount } from '../sync/account';
import { FREE_STORAGE_BYTES } from '../lib/sync';
import { signInProblem, signUpProblem } from '../lib/auth';
import { mb } from '../audio/songFiles';
import { getPref, setPref } from '../lib/storage';
import { g } from '../lib/gender';

const when = (ms: number) => new Date(ms).toLocaleString('ar-EG', { weekday: 'long', hour: 'numeric', minute: '2-digit' });

/** "👤 حسابي" (under المزيد): optional email + password sign-in, so the data also lives in her own Supabase project. */
export function AccountPage() {
  const a = useAccount();
  const [email, setEmail] = useState(() => getPref('sync.email') ?? '');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState(false);
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

  const ready = !(mode === 'in' ? signInProblem(email, password) : signUpProblem(email, password, confirm));
  const switchMode = (m: 'in' | 'up') => {
    setMode(m);
    setErr('');
    setSent(false);
    setConfirm('');
  };

  if (!a.user)
    return (
      <Page help="account" title="👤 حسابي" intro="اختياري: بإيميلك، بياناتك بتتحفظ كمان في السيرفر بتاعك وتتزامن بين الموبايل واللابتوب.">
        <div className="panel">
          <div className="choices" role="group" aria-label="دخول أو حساب جديد">
            <button className={mode === 'in' ? 'chip active' : 'chip'} onClick={() => switchMode('in')}>
              دخول
            </button>
            <button className={mode === 'up' ? 'chip active' : 'chip'} onClick={() => switchMode('up')}>
              إنشاء حساب
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!ready) return;
              void run(async () => {
                setPref('sync.email', email.trim());
                const e = await (mode === 'in' ? signIn(email, password) : createAccount(email, password, confirm));
                if (!e) {
                  setPassword('');
                  setConfirm('');
                  setMode('in');
                }
                return e;
              });
            }}
          >
            <label className="field">
              <span>إيميلك</span>
              <input type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </label>
            <label className="field">
              <span>{mode === 'in' ? 'الباسورد' : 'باسورد جديد (٨ حروف أو أرقام على الأقل)'}</span>
              <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {mode === 'up' && (
              <label className="field">
                <span>اكتبي الباسورد تاني</span>
                <input type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </label>
            )}
            <button type="submit" className="big primary" disabled={busy || !ready}>
              {busy ? '…' : mode === 'in' ? 'دخول' : 'إنشاء حساب'}
            </button>
          </form>
          {mode === 'in' && (
            <button
              className="link"
              disabled={busy}
              onClick={() => {
                setSent(false);
                void run(async () => {
                  const e = await forgotPassword(email);
                  if (!e) setSent(true);
                  return e;
                });
              }}
            >
              نسيتي الباسورد؟
            </button>
          )}
          {sent && <p className="ok-text">✔ بعتنا لينك على إيميلك. هيفتح في Safari: اختاري باسورد جديد، وبعدين ارجعي هنا وادخلي بيه.</p>}
          {mode === 'up' && <p className="hint">اكتبي إيميلك مظبوط: هو اللي بيوصله لينك «نسيتي الباسورد؟».</p>}
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
