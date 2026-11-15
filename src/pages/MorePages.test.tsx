// Exercises list, More, badges and the daily challenge, the guide, the help popups, and girl/boy switching.
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { button, go, renderApp, tick } from '../test/app';
import { browser } from '../lib/reload';
import { addResult, getPref } from '../lib/storage';
import { HELP } from '../content/help';

describe('exercises page', () => {
  it('a few big groups; each opens a short list whose cards open their exercise', async () => {
    const { user } = renderApp('exercises');
    const groups = [...document.querySelectorAll('main a.list-row')].map((a) => a.getAttribute('href')!);
    expect(groups.length).toBe(5);
    for (const g of groups) {
      await go(g.replace('#/', ''));
      const items = [...document.querySelectorAll('main a.list-row')].map((a) => a.getAttribute('href')!);
      expect(items.length, g).toBeGreaterThan(1);
      expect(items.length, g).toBeLessThanOrEqual(6);
      for (const href of items) {
        await go(href.replace('#/', ''));
        expect(document.querySelector('.crash-screen'), href).toBeNull();
      }
    }
    await go('exercises/pitch');
    await user.click(screen.getByRole('link', { name: /مطابقة النغمة/ }));
    expect(window.location.hash).toBe('#/match');
    await user.click(document.querySelector('a.back') as HTMLElement);
    await tick(20);
    expect(window.location.hash).toBe('#/exercises');
  });
});

describe('more', () => {
  it('links to the account, badges, guide and teacher pages', () => {
    renderApp('more');
    for (const href of ['#/account', '#/badges', '#/guide', '#/teacher']) expect(document.querySelector(`main a[href="${href}"]`), href).toBeTruthy();
  });

  it('switching to "ولد" saves it and reloads the wording; picking the same one does nothing', async () => {
    const { user } = renderApp('more');
    await user.click(button(/بنت/));
    expect(browser.reload).not.toHaveBeenCalled();
    await user.click(button(/ولد/));
    expect(getPref('gender')).toBe('m');
    expect(browser.reload).toHaveBeenCalledTimes(1);
  });
});

describe('badges and the daily challenge', () => {
  it("today's challenge is shown, and a result that meets it is celebrated", async () => {
    renderApp('badges');
    expect(screen.getByText(/تحدي النهارده/)).toBeTruthy();
    const link = document.querySelector('main a.button-link.primary') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/^#\//);
    for (let i = 0; i < 20; i++) addResult('match', 100, '10/10');
    addResult('sustain', 30);
    addResult('range', 24, 'C3–C5');
    await tick(100);
    await go('badges');
    expect(document.querySelectorAll('main .badge.on').length).toBeGreaterThan(0);
  });
});

describe('guide and help popups', () => {
  it('the guide opens, and every link in it goes to a real page', async () => {
    renderApp('guide');
    const hrefs = [...document.querySelectorAll('main a')].map((a) => a.getAttribute('href')!).filter((h) => h.startsWith('#/'));
    expect(hrefs.length).toBeGreaterThan(3);
    for (const h of hrefs) {
      await go(h.replace('#/', ''));
      expect(document.querySelector('.crash-screen'), h).toBeNull();
    }
  });

  it('every page’s "❓" opens its explanation and closes again', async () => {
    const { user } = renderApp('');
    const routes = Object.values(HELP)
      .map((h) => h.href?.replace('#/', ''))
      .filter((r): r is string => !!r);
    let opened = 0;
    for (const r of [...new Set(routes)]) {
      await go(r);
      const toggle = document.querySelector('main .help-toggle') as HTMLElement | null;
      if (!toggle) continue;
      await user.click(toggle);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getAllByRole('heading').length).toBeGreaterThan(0);
      await user.click(within(dialog).getByRole('button', { name: 'قفل الشرح' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      opened++;
    }
    expect(opened).toBeGreaterThan(15);
  });
});
