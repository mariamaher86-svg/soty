import { describe, expect, it } from 'vitest';
import { authErrorMessage, BLOCKED_MSG, forgotFlow, newPasswordFlow, newPasswordProblem, parseAuthHash, RESET_REDIRECT, signInFlow, signInProblem, signUpFlow, signUpProblem, validEmail, type AuthBackend, type AuthErr } from './auth';

/** Supabase Auth in memory, with "Confirm email" off unless asked. */
class FakeAuth implements AuthBackend {
  users = new Map<string, string>();
  confirmEmail = false;
  resets: { email: string; redirectTo: string }[] = [];
  password = '';
  failWith: AuthErr | null = null;
  async signUp({ email, password }: { email: string; password: string }) {
    if (this.failWith) return { data: { user: null }, error: this.failWith };
    const exists = this.users.has(email);
    if (this.confirmEmail) {
      if (!exists) this.users.set(email, password);
      return { data: { user: { id: 'u1', email, identities: exists ? [] : [{}] }, session: null }, error: null };
    }
    if (exists) return { data: { user: null }, error: { code: 'user_already_exists', message: 'User already registered', status: 422 } };
    this.users.set(email, password);
    return { data: { user: { id: 'u1', email }, session: {} }, error: null };
  }
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    if (this.failWith) return { data: { user: null }, error: this.failWith };
    if (this.users.get(email) !== password) return { data: { user: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } };
    return { data: { user: { id: 'u1', email }, session: {} }, error: null };
  }
  async resetPasswordForEmail(email: string, o: { redirectTo: string }) {
    this.resets.push({ email, redirectTo: o.redirectTo });
    return { error: this.failWith };
  }
  async updateUser({ password }: { password: string }) {
    if (this.failWith) return { error: this.failWith };
    this.password = password;
    return { error: null };
  }
}

describe('input checks', () => {
  it('email, password of at least 8, matching confirm', () => {
    expect(validEmail(' maria@example.com ')).toBe(true);
    expect(validEmail('maria@')).toBe(false);
    expect(signUpProblem('maria@', 'password1', 'password1')).toContain('الإيميل');
    expect(signUpProblem('a@b.co', '1234567', '1234567')).toContain('٨');
    expect(signUpProblem('a@b.co', '12345678', '12345679')).toContain('مش زي بعض');
    expect(signUpProblem('a@b.co', '12345678', '12345678')).toBeNull();
    expect(signInProblem('a@b.co', '')).toContain('الباسورد');
    expect(signInProblem('a@b.co', 'x')).toBeNull(); // an old short password can still sign in
    expect(newPasswordProblem('12345678', '12345678')).toBeNull();
    expect(newPasswordProblem('short', 'short')).toContain('٨');
  });
});

describe('the forgot-password link vs normal pages', () => {
  it('normal routes are never auth tokens', () => {
    for (const h of ['', '#', '#/', '#/piano', '#/piano/vocalise', '#/songs/s1/learn', '#/x?type=recovery&access_token=abc', '#access_token=abc', '#type=recovery', '#access_token=abc&type=signup']) {
      expect(parseAuthHash(h)).toBeNull();
    }
  });
  it('recovery tokens and error variants are recognised', () => {
    expect(parseAuthHash('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery')).toEqual({ kind: 'recovery' });
    const expired = parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(expired?.kind).toBe('error');
    expect(expired && 'message' in expired && expired.message).toContain('خلص');
    expect(parseAuthHash('#error_description=Something+else')?.kind).toBe('error');
  });
});

describe('error messages', () => {
  it('each case has its own clear Arabic sentence', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('الإيميل أو الباسورد غلط.');
    expect(authErrorMessage({ message: 'Invalid login credentials' })).toBe('الإيميل أو الباسورد غلط.');
    expect(authErrorMessage({ code: 'email_exists' })).toContain('عنده حساب');
    expect(authErrorMessage({ code: 'weak_password' })).toContain('ضعيف');
    expect(authErrorMessage({ code: 'over_request_rate_limit' })).toContain('محاولات كتير');
    expect(authErrorMessage({ status: 429 })).toContain('محاولات كتير');
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(BLOCKED_MSG);
    expect(authErrorMessage({ message: 'Failed to fetch' })).toBe(BLOCKED_MSG);
    expect(authErrorMessage({ code: 'same_password' })).toContain('نفس');
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toContain('Confirm email');
    expect(authErrorMessage({ message: 'odd' })).toContain('odd');
  });
});

describe('the flows, on a fake backend', () => {
  it('create an account → signed in right away; the same email again → clear message', async () => {
    const a = new FakeAuth();
    expect((await signUpFlow(a, ' m@b.co ', 'password1', 'password1')).user?.email).toBe('m@b.co');
    expect((await signUpFlow(a, 'm@b.co', 'password1', 'password1')).error).toContain('عنده حساب');
    expect(a.users.size).toBe(1);
  });
  it('bad input never reaches the server', async () => {
    const a = new FakeAuth();
    expect((await signUpFlow(a, 'm@b.co', 'short', 'short')).error).toContain('٨');
    expect(a.users.size).toBe(0);
  });
  it('"Confirm email" still on: no silent half-account', async () => {
    const a = new FakeAuth();
    a.confirmEmail = true;
    expect((await signUpFlow(a, 'm@b.co', 'password1', 'password1')).error).toContain('Confirm email');
    expect((await signUpFlow(a, 'm@b.co', 'password1', 'password1')).error).toContain('عنده حساب');
  });
  it('sign in: right and wrong password, blocked network', async () => {
    const a = new FakeAuth();
    a.users.set('m@b.co', 'password1');
    expect((await signInFlow(a, 'm@b.co', 'password1')).user?.id).toBe('u1');
    expect((await signInFlow(a, 'm@b.co', 'nope')).error).toBe('الإيميل أو الباسورد غلط.');
    a.failWith = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
    expect((await signInFlow(a, 'm@b.co', 'password1')).error).toBe(BLOCKED_MSG);
  });
  it('forgot password sends her back to the app address; a new password is saved', async () => {
    const a = new FakeAuth();
    expect(await forgotFlow(a, 'nope')).toContain('إيميلك');
    expect(a.resets).toEqual([]);
    expect(await forgotFlow(a, ' m@b.co ')).toBeNull();
    expect(a.resets).toEqual([{ email: 'm@b.co', redirectTo: RESET_REDIRECT }]);
    expect(await newPasswordFlow(a, 'newpassword', 'different')).toContain('مش زي بعض');
    expect(await newPasswordFlow(a, 'newpassword', 'newpassword')).toBeNull();
    expect(a.password).toBe('newpassword');
    a.failWith = { code: 'same_password' };
    expect(await newPasswordFlow(a, 'newpassword', 'newpassword')).toContain('نفس');
  });
});
