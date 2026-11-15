import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, leaveApp, renderApp, returnToApp, sing, silence, tick } from '../test/app';
import { mic } from '../test/fakeMic';
import { getRange, getResults } from '../lib/storage';

describe('range test', () => {
  it('lowest, then highest steady note; the result is saved and shown next time', async () => {
    const { user } = renderApp('range');
    await user.click(button('ابدئي الاختبار'));
    expect((button('التالي ←') as HTMLButtonElement).disabled).toBe(true);
    await sing(50, 1200); // D3
    await sing(48, 1200); // lower: C3 wins
    await sing(55, 1200); // higher doesn't count on the low step
    await user.click(button('التالي ←'));
    expect((button('شوفي النتيجة') as HTMLButtonElement).disabled).toBe(true);
    await sing(70, 1200);
    await sing(74, 1200);
    await silence(100);
    await user.click(button('شوفي النتيجة'));
    expect(mic.open).toBe(0);
    expect(getRange()).toMatchObject({ low: 48, high: 74 });
    expect(getResults().find((r) => r.type === 'range')!.value).toBe(26);
    expect(screen.getByText(/النتيجة اتحفظت/)).toBeTruthy();
    await user.click(button('اسمعي أوطى نغمة'));
    await tick(2000);
    await user.click(button('تمام'));
    expect(screen.getByText(/آخر نتيجة/)).toBeTruthy();
  });

  it('a wobbling voice is not taken as a steady note', async () => {
    const { user } = renderApp('range');
    await user.click(button('ابدئي الاختبار'));
    for (let i = 0; i < 12; i++) await sing(i % 2 ? 50 : 53, 100);
    expect((button('التالي ←') as HTMLButtonElement).disabled).toBe(true);
  });

  it('leaving mid-test stops the mic; coming back starts over cleanly', async () => {
    const { user } = renderApp('range');
    await user.click(button('ابدئي الاختبار'));
    await sing(50, 1200);
    await leaveApp();
    expect(mic.open).toBe(0);
    await returnToApp();
    await user.click(button('ابدئي الاختبار'));
    expect(mic.open).toBe(1);
  });

  it('a denied mic says why', async () => {
    mic.deny = 'NotFoundError';
    const { user } = renderApp('range');
    await user.click(button('ابدئي الاختبار'));
    await tick(10);
    expect(screen.getByText(/مفيش ميكروفون/)).toBeTruthy();
  });
});
