// The first screen: nobody uses the app without signing in. Email + password, "إنشاء حساب", "نسيتي الباسورد؟".
// Data already on this phone (from before accounts) is kept and merged into the account on the first sign-in.

import { useState } from 'react';
import { ErrorText } from '../components/ui';
import { AppLogo } from '../components/AppLogo';
import { createAccount, forgotPassword, signIn, useAccount } from '../sync/account';
import { signInProblem, signUpProblem } from '../lib/auth';
import { getPref, setPref } from '../lib/storage';
import { useOnline } from '../audio/offline';

export function SignInForm() {
  const a = useAccount();
  const online = useOnline();
  const [email, setEmail] = useState(() => getPref('sync.email') ?? '');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

  return (
    <div className="signin-form">
      <div className="choices" role="group" aria-label="دخول أو حساب جديد">
        <button className={mode === 'in' ? 'chip active' : 'chip'} onClick={() => switchMode('in')}>
          دخول
        </button>
        <button className={mode === 'up' ? 'chip active' : 'chip'} onClick={() => switchMode('up')}>
          إنشاء حساب
        </button>
      </div>
      {!online && <p className="warn-text">مفيش إنترنت: أول دخول محتاج إنترنت. بعد كده التطبيق بيفتح من غير نت.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          void run(async () => {
            setPref('sync.email', email.trim());
            const r = await (mode === 'in' ? signIn(email, password) : createAccount(email, password, confirm));
            if (!r) {
              setPassword('');
              setConfirm('');
            }
            return r;
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
              const r = await forgotPassword(email);
              if (!r) setSent(true);
              return r;
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
  );
}

/** The gate: shown instead of the whole app until she's signed in (deep links included). */
export function SignInScreen() {
  return (
    <main className="gate" aria-label="الدخول">
      <div className="gate-card">
        <AppLogo size={80} />
        <h1>صوتي</h1>
        <p className="hint">ادخلي بحسابك عشان تبدئي. بياناتك بتتحفظ في حسابك وترجع على أي جهاز.</p>
        <SignInForm />
      </div>
    </main>
  );
}

/** No Supabase settings in this build: the app doesn't run without its sign-in, so it says so plainly. */
export function NotConfiguredScreen() {
  return (
    <main className="gate" aria-label="التطبيق مش متظبط">
      <div className="gate-card">
        <AppLogo size={80} />
        <h1>التطبيق مش متظبط</h1>
        <p>النسخة دي من التطبيق مفيهاش إعدادات الحساب (Supabase)، فمش هينفع تدخلي.</p>
        <p className="hint">اللي بيجهّز التطبيق: خطوات Supabase في ملف README (الجزء "حسابي والمزامنة").</p>
      </div>
    </main>
  );
}
