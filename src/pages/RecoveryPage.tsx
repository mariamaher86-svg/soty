import { useEffect, useState } from 'react';
import { ErrorText, Page } from '../components/ui';
import { newPasswordProblem, type AuthLanding } from '../lib/auth';
import { recoveryReady, saveNewPassword } from '../sync/account';

const cleanUrl = () => window.history.replaceState(null, '', window.location.pathname);

/**
 * "اختاري باسورد جديد": where the forgot-password email lands. It opens in Safari with its tokens in the URL hash, so
 * main.tsx shows this instead of the app (the router would read the tokens as a page).
 */
export function RecoveryPage({ landing }: { landing: AuthLanding }) {
  const [phase, setPhase] = useState<'checking' | 'form' | 'done' | 'failed'>(landing.kind === 'error' ? 'failed' : 'checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(landing.kind === 'error' ? landing.message : '');

  useEffect(() => {
    if (landing.kind === 'error') return cleanUrl();
    void recoveryReady().then((ok) => {
      cleanUrl(); // the tokens have been read: don't leave them in the address bar
      if (ok) setPhase('form');
      else {
        setErr('لينك تغيير الباسورد خلص أو اتستخدم قبل كده — اطلبي لينك جديد من «نسيتي الباسورد؟».');
        setPhase('failed');
      }
    });
  }, []);

  const save = async () => {
    setBusy(true);
    setErr('');
    const e = await saveNewPassword(password, confirm);
    setBusy(false);
    if (e) setErr(e);
    else setPhase('done');
  };

  const openApp = () => {
    window.location.hash = '#/account';
    window.location.reload();
  };

  return (
    <div className="app">
      <main>
        <Page title="🔑 اختاري باسورد جديد">
          <div className="panel">
            {phase === 'checking' && <p className="hint">لحظة…</p>}
            {phase === 'form' && (
              <>
                <label className="field">
                  <span>الباسورد الجديد (٨ حروف أو أرقام على الأقل)</span>
                  <input type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <label className="field">
                  <span>اكتبيه تاني</span>
                  <input type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </label>
                <button className="big primary" disabled={busy || !!newPasswordProblem(password, confirm)} onClick={() => void save()}>
                  {busy ? '…' : 'احفظي الباسورد'}
                </button>
              </>
            )}
            {phase === 'done' && (
              <>
                <p className="ok-text">✔ الباسورد اتغيّر.</p>
                <p>ارجعي للتطبيق من الأيقونة، وادخلي بالباسورد الجديد.</p>
                <p className="hint">على اللابتوب؟ التطبيق هنا في نفس الصفحة:</p>
                <button onClick={openApp}>افتحي التطبيق</button>
              </>
            )}
            {phase === 'failed' && <button onClick={openApp}>افتحي التطبيق</button>}
            <ErrorText text={err} />
          </div>
        </Page>
      </main>
    </div>
  );
}
