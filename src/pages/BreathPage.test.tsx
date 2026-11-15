import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, hiss, leaveApp, renderApp, returnToApp, sing, silence, tick } from '../test/app';
import { mic } from '../test/fakeMic';
import { getResults } from '../lib/storage';

const results = (type: string) => getResults().filter((r) => r.type === type);

describe('breath: sustain', () => {
  it('times one held note, saves it, and "مرة كمان" really starts a new try', async () => {
    const { user } = renderApp('breath');
    await user.click(button('ابدئي'));
    await silence(500);
    await sing(57, 4000);
    await silence(800);
    expect(screen.getByText(/اتحفظ ✔/)).toBeTruthy();
    expect(mic.open).toBe(0);
    const first = results('sustain');
    expect(first).toHaveLength(1);
    expect(first[0].value).toBeGreaterThan(3.5);
    expect(first[0].value).toBeLessThan(4.6);
    await user.click(button('مرة كمان'));
    expect(mic.open).toBe(1);
    expect(document.querySelector('.timer')!.textContent).toMatch(/^0\.0/);
    await sing(57, 2000);
    await silence(800);
    expect(results('sustain')).toHaveLength(2);
  });

  it('a short sound under a second is not saved', async () => {
    const { user } = renderApp('breath');
    await user.click(button('ابدئي'));
    await sing(57, 500);
    await silence(800);
    expect(results('sustain')).toHaveLength(0);
  });

  it('cancel stops listening', async () => {
    const { user } = renderApp('breath');
    await user.click(button('ابدئي'));
    await user.click(button('إلغاء'));
    expect(mic.open).toBe(0);
    expect(button('ابدئي')).toBeTruthy();
  });
});

describe('breath: stability', () => {
  it('5 seconds on one note gives a small number and a rating', async () => {
    const { user } = renderApp('breath');
    await user.click(button('ثبات الصوت'));
    await user.click(button('ابدئي'));
    await sing(60, 6000);
    expect(document.querySelector('.score-value')!.textContent).toMatch(/★/); // one big rating
    const r = results('stability');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeLessThan(5);
    expect(mic.open).toBe(0);
  });

  it('a shaky note scores worse than a steady one', async () => {
    const { user } = renderApp('breath');
    await user.click(button('ثبات الصوت'));
    await user.click(button('ابدئي'));
    for (let i = 0; i < 60; i++) await sing(60, 100, i % 2 ? 30 : -30);
    expect(results('stability')[0].value).toBeGreaterThan(15);
  });
});

describe('breath: ssss', () => {
  it('inhale, hold, then the hiss is timed and saved', async () => {
    const { user } = renderApp('breath');
    await user.click(button('تمرين سسسس'));
    await user.click(button('ابدئي'));
    expect(screen.getByText(/خدي نفس من مناخيرك/)).toBeTruthy();
    await silence(4100);
    expect(screen.getByText(/اكتمي نفسك/)).toBeTruthy();
    mic.level = 0.002; // a quiet room while holding
    await silence(4100);
    mic.level = 0.3;
    await hiss(6000);
    await silence(800);
    expect(screen.getByText(/اتحفظ ✔/)).toBeTruthy();
    expect(results('hiss')[0].value).toBeGreaterThan(5);
  });

  it('no hiss at all ends kindly after a few seconds, saving nothing', async () => {
    const { user } = renderApp('breath');
    await user.click(button('تمرين سسسس'));
    await user.click(button('ابدئي'));
    await silence(8300);
    await silence(5200);
    expect(screen.getByText(/مسمعناش سسسس كفاية/)).toBeTruthy();
    expect(results('hiss')).toHaveLength(0);
    expect(mic.open).toBe(0);
  });

  it('leaving in the middle releases the mic and the page is fresh on return', async () => {
    const { user } = renderApp('breath');
    await user.click(button('تمرين سسسس'));
    await user.click(button('ابدئي'));
    await tick(1000);
    await leaveApp();
    expect(mic.open).toBe(0);
    await returnToApp();
    expect(button('ابدئي')).toBeTruthy();
  });
});
