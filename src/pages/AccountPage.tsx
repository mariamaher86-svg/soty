import { useState } from 'react';
import { ErrorText, Page } from '../components/ui';
import { deleteServerData, signOut, syncNow, unsyncedFiles, useAccount } from '../sync/account';
import { SignInForm } from './SignInPage';
import { FREE_STORAGE_BYTES } from '../lib/sync';
import { mb } from '../audio/songFiles';
import { getPref, setPref } from '../lib/storage';
import { g } from '../lib/gender';

const when = (ms: number) => new Date(ms).toLocaleString('ar-EG', { weekday: 'long', hour: 'numeric', minute: '2-digit' });

/** "👤 حسابي" (under المزيد): optional email + password sign-in, so the data also lives in her own Supabase project. */
export function AccountPage() {
  const a = useAccount();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaving, setLeaving] = useState<{ songs: string[]; recordings: number } | null>(null);
  const [audio, setAudio] = useState(() => getPref('sync.audio') !== '0');

  const run = async (f: () => Promise<string | null>) => {
    setBusy(true);
    setErr('');
    const e = await f();
    setBusy(false);
    if (e) setErr(e);
    return !e;
  };

  // the app's gate shows the sign-in before any page; this is only a fallback
  if (!a.user)
    return (
      <Page help="account" title="👤 حسابي">
        <SignInForm />
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
        {a.filesTooBig > 0 && <p className="warn-text">{a.filesTooBig} ملف أكبر من ٥٠ ميجا مش بيتزامن (حد الخطة المجانية) وبيفضل على الجهاز ده.</p>}
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
          <button onClick={() => void unsyncedFiles().then(setLeaving)}>اخرجي من الحساب</button>
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            امسحي بياناتي من السيرفر
          </button>
        </div>
        <p className="hint">الخروج بيزامن الأول وبعدين بيمسح بياناتك من الجهاز ده. مسح السيرفر مش بيمسح حاجة من الجهاز.</p>
        {leaving && (
          <div className="confirm-box" role="alertdialog" aria-label="تأكيد الخروج">
            <p>
              هنزامن بياناتك الأول، وبعدين <b>هنمسحها من الجهاز ده</b> عشان أي حد يستخدم الموبايل بعدك ميشوفش حاجة. لما {g('تدخلي', 'تدخل')} تاني كل حاجة بترجع من السيرفر.
            </p>
            {(leaving.songs.length > 0 || leaving.recordings > 0) && (
              <div className="warn-text">
                <p>الحاجات دي متخزنة على الجهاز ده بس ومش على السيرفر، فهتضيع:</p>
                <ul>
                  {leaving.songs.map((t) => (
                    <li key={t}>ملف صوت أغنية: {t}</li>
                  ))}
                  {leaving.recordings > 0 && <li>{leaving.recordings} تسجيل للمعلم</li>}
                </ul>
                <a className="button-link primary" href="#/more" onClick={() => sessionStorage.setItem('soty.backup.open', '1')}>
                  صدّري نسخة احتياطية الأول
                </a>
              </div>
            )}
            <div className="row">
              <button className="danger" disabled={busy} onClick={() => void run(signOut)}>
                {busy ? 'بنزامن…' : 'أيوه، زامني واخرجي'}
              </button>
              <button disabled={busy} onClick={() => setLeaving(null)}>
                لأ
              </button>
            </div>
          </div>
        )}
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
