// A build without the Supabase settings: the app says it isn't set up and never runs without its sign-in.
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { go, renderApp } from '../test/app';
import { useAccount } from '../sync/account';

vi.mock('../config/supabase', () => ({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '', supabaseUrl: '', supabaseKey: '' }));

describe('no Supabase settings', () => {
  it('"التطبيق مش متظبط" instead of the app, on every route; there is no way around it', async () => {
    renderApp('');
    for (const r of ['', 'piano', 'lessons', 'account', 'more']) {
      await go(r);
      expect(screen.getByRole('heading', { name: 'التطبيق مش متظبط' }), r).toBeTruthy();
      expect(document.querySelector('.tabbar'), r).toBeNull();
      expect(document.querySelector('form'), r).toBeNull();
    }
    expect(typeof useAccount).toBe('function');
  });
});
