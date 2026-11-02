// "حسابي": email + password sign-in — input checks, Arabic error messages, the forgot-password landing, and the flows
// behind a small interface (Supabase Auth in the app, a fake in tests). Passwords are never stored by the app.

export const MIN_PASSWORD = 8;
/** Where the recovery email's link lands. It must also be in Supabase → Authentication → URL Configuration. */
export const RESET_REDIRECT = 'https://mariamaher86-svg.github.io/soty/';

export function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

const passwordProblem = (password: string, confirm: string): string | null => {
  if (password.length < MIN_PASSWORD) return 'الباسورد لازم يكون ٨ حروف أو أرقام على الأقل.';
  if (password !== confirm) return 'الباسورد والتأكيد مش زي بعض.';
  return null;
};

export function signUpProblem(email: string, password: string, confirm: string): string | null {
  return validEmail(email) ? passwordProblem(password, confirm) : 'الإيميل مش مكتوب صح.';
}

export function signInProblem(email: string, password: string): string | null {
  if (!validEmail(email)) return 'الإيميل مش مكتوب صح.';
  return password ? null : 'اكتبي الباسورد.';
}

export const newPasswordProblem = passwordProblem;

export interface AuthErr {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

export const BLOCKED_MSG = 'السيرفر مش بيرد من الشبكة دي (ممكن تكون قافلاه) — جربي واي فاي تاني أو بيانات الموبايل. التطبيق شغال عادي.';
export const OFFLINE_MSG = 'مفيش إنترنت دلوقتي — جربي تاني لما النت يرجع. التطبيق شغال عادي.';

/** Supabase's error → one clear Arabic sentence. */
export function authErrorMessage(e: AuthErr | null): string {
  const code = e?.code ?? '';
  const m = (e?.message ?? '').toLowerCase();
  if (e?.name === 'AuthRetryableFetchError' || e?.status === 0 || m.includes('fetch') || m.includes('network')) return BLOCKED_MSG;
  if (e?.status === 429 || code.startsWith('over_') || m.includes('rate limit') || m.includes('security purposes')) return 'محاولات كتير ورا بعض — استني شوية وجربي تاني.';
  if (code === 'invalid_credentials' || m.includes('invalid login credentials')) return 'الإيميل أو الباسورد غلط.';
  if (code === 'user_already_exists' || code === 'email_exists' || m.includes('already registered')) return 'الإيميل ده عنده حساب بالفعل — دوسي «دخول».';
  if (code === 'same_password') return 'ده نفس الباسورد القديم — اختاري واحد جديد.';
  if (code === 'weak_password' || m.includes('password should')) return 'الباسورد ضعيف — خليه أطول، وفيه حروف وأرقام.';
  if (code === 'email_not_confirmed' || m.includes('not confirmed')) return 'الحساب مستني تأكيد الإيميل: لازم «Confirm email» يتقفل في مشروع Supabase.';
  if (code === 'signup_disabled' || m.includes('signups not allowed')) return 'إنشاء حسابات جديدة مقفول في المشروع ده.';
  if (code === 'email_address_invalid' || m.includes('email address') || m.includes('invalid email')) return 'الإيميل مش مكتوب صح.';
  if (code === 'otp_expired' || code === 'session_not_found' || code === 'flow_state_expired' || m.includes('expired')) return 'لينك تغيير الباسورد خلص أو اتستخدم قبل كده — اطلبي لينك جديد من «نسيتي الباسورد؟».';
  return 'حصلت مشكلة: ' + (e?.message ?? 'جربي تاني.');
}

export type AuthLanding = { kind: 'recovery' } | { kind: 'error'; message: string };

/**
 * The forgot-password link comes back with its tokens in the URL hash ("#access_token=…&type=recovery", or
 * "#error=…"). That hash is not a page: it's handled before the router. App routes always start with "#/".
 */
export function parseAuthHash(hash: string): AuthLanding | null {
  if (!hash.startsWith('#') || hash.startsWith('#/')) return null;
  const p = new URLSearchParams(hash.slice(1));
  if (p.get('error') || p.get('error_code') || p.get('error_description')) {
    return { kind: 'error', message: authErrorMessage({ code: p.get('error_code') ?? '', message: p.get('error_description') ?? p.get('error') ?? '' }) };
  }
  return p.get('access_token') && p.get('type') === 'recovery' ? { kind: 'recovery' } : null;
}

// ---- the flows

export interface AuthUser {
  id: string;
  email?: string;
  identities?: unknown[];
}

interface Res {
  data: { user: AuthUser | null; session?: unknown };
  error: AuthErr | null;
}

export interface AuthBackend {
  signUp(c: { email: string; password: string }): Promise<Res>;
  signInWithPassword(c: { email: string; password: string }): Promise<Res>;
  resetPasswordForEmail(email: string, o: { redirectTo: string }): Promise<{ error: AuthErr | null }>;
  updateUser(c: { password: string }): Promise<{ error: AuthErr | null }>;
}

export type AuthResult = { user: AuthUser; error?: undefined } | { user?: undefined; error: string };

/** Create an account. With "Confirm email" off she's signed in right away; no session means that setting is still on. */
export async function signUpFlow(auth: AuthBackend, email: string, password: string, confirm: string): Promise<AuthResult> {
  const problem = signUpProblem(email, password, confirm);
  if (problem) return { error: problem };
  const { data, error } = await auth.signUp({ email: email.trim(), password });
  if (error) return { error: authErrorMessage(error) };
  if (data.user && data.session) return { user: data.user };
  // with confirmation on, Supabase hides an existing email behind a user without identities
  if (data.user?.identities?.length === 0) return { error: authErrorMessage({ code: 'user_already_exists' }) };
  return { error: authErrorMessage({ code: 'email_not_confirmed' }) };
}

export async function signInFlow(auth: AuthBackend, email: string, password: string): Promise<AuthResult> {
  const problem = signInProblem(email, password);
  if (problem) return { error: problem };
  const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) return { error: authErrorMessage(error) };
  return { user: data.user };
}

/** Send the recovery email. Null = sent. */
export async function forgotFlow(auth: AuthBackend, email: string): Promise<string | null> {
  if (!validEmail(email)) return 'اكتبي إيميلك الأول، وبعدين دوسي «نسيتي الباسورد؟».';
  const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: RESET_REDIRECT });
  return error ? authErrorMessage(error) : null;
}

/** Save the new password on the recovery screen. Null = saved. */
export async function newPasswordFlow(auth: AuthBackend, password: string, confirm: string): Promise<string | null> {
  const problem = newPasswordProblem(password, confirm);
  if (problem) return problem;
  const { error } = await auth.updateUser({ password });
  return error ? authErrorMessage(error) : null;
}
