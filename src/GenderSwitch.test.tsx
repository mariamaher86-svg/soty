// Masculine mode: the feminine source text on screen is converted, including text that appears later.
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, go, prime, renderApp, tick } from './test/app';
import { setPref } from './lib/storage';
import { startMasculine } from './lib/genderDom';
import { g } from './lib/gender';

describe('girl/boy wording', () => {
  it('masculine mode converts every page, and new text as it appears', async () => {
    prime({ gender: 'm' });
    const { user } = renderApp('match', { prime: false });
    startMasculine(document.body);
    await tick(10);
    expect(screen.queryByRole('button', { name: 'ابدئي' })).toBeNull();
    expect(button('ابدأ')).toBeTruthy();
    for (const r of ['', 'exercises', 'lessons', 'breath', 'ear', 'path', 'more']) {
      await go(r);
      const text = document.querySelector('main')!.textContent!;
      expect(text, r).not.toMatch(/(^|[\s«"])(ابدئي|اسمعي|خدي|دوسي|إنتي)(?=[\s»".,،:!؟]|$)/);
    }
    await go('ear');
    await user.click(button(/ابدأ/));
    await tick(3000);
    // text that appears later (the answer hint) is converted too
    expect(document.querySelector('main')!.textContent).toMatch(/التانية أعلى/);
    expect(document.querySelector('main')!.textContent).not.toMatch(/(^|\s)(اسمعي|دوسي)(\s|$)/);
  });

  it('g() picks the form by the setting', () => {
    setPref('gender', 'm');
    expect(g('جاهزة', 'جاهز')).toBe('جاهز');
    setPref('gender', 'f');
    expect(g('جاهزة', 'جاهز')).toBe('جاهزة');
  });
});
