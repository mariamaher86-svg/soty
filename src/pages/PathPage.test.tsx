import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { button, hiss, queryButton, renderApp, sing, silence, tick } from '../test/app';
import { mic } from '../test/fakeMic';
import { getPath, updatePath } from '../lib/storage';
import { noteName } from '../lib/music';
import type { Measurement } from '../lib/path';
import type { UserEvent } from '@testing-library/user-event';

// the path's own step bar is the last one (an exercise inside it, like the warm-up, can have its own)
const pathNav = () => [...document.querySelectorAll('.step-nav')].at(-1) as HTMLElement;
const stepNext = () => within(pathNav()).getByRole('button', { name: /التالي ←|خلصت ✔/ }) as HTMLButtonElement;
const skip = () => within(pathNav()).getByRole('button', { name: 'تخطي الخطوة' });
const stepTitle = () => document.querySelector('.step-head h2')!.textContent;

function target(): number {
  const name = document.querySelector('.target-note span')!.textContent!;
  for (let m = 36; m < 90; m++) if (noteName(m) === name) return m;
  throw new Error('no target');
}

const baseline = (date: string): Measurement => ({ date, rangeLow: 50, rangeHigh: 72, matchCents: 30, matchLockSec: 2, sustainSec: 6, stabilityCents: 12, hissSec: 10 });

async function matchTries(user: UserEvent, n: number) {
  await user.click(button('ابدئي'));
  await tick(1600);
  for (let i = 0; i < n; i++) {
    await sing(target(), 1400);
    await user.click(button(/النغمة اللي بعدها/));
    await tick(1600);
  }
}

describe('beginner path: the first measurement', () => {
  it('all five steps with her voice; "next" only works after a real result; the baseline is saved', async () => {
    const { user } = renderApp('path');
    await user.click(button('ابدئي قياس البداية'));
    // 1. range
    expect(stepTitle()).toBe('المساحة الصوتية');
    expect(stepNext().disabled).toBe(true);
    await user.click(button('ابدئي الاختبار'));
    await sing(50, 1200);
    await user.click(within(document.querySelector('.embedded')!).getByRole('button', { name: 'التالي ←' }));
    await sing(70, 1200);
    await user.click(button('شوفي النتيجة'));
    expect(stepNext().disabled).toBe(false);
    await user.click(stepNext());
    // 2. match: five tries
    expect(stepTitle()).toBe('مطابقة النغمة');
    await matchTries(user, 5);
    expect(stepNext().disabled).toBe(false);
    await user.click(stepNext());
    // 3. sustain
    await user.click(button('ابدئي'));
    await sing(57, 3000);
    await silence(800);
    await user.click(stepNext());
    // 4. stability
    await user.click(button('ابدئي'));
    await sing(57, 6000);
    await user.click(stepNext());
    // 5. hiss
    await user.click(button('ابدئي'));
    mic.level = 0.002;
    await silence(8200);
    mic.level = 0.3;
    await hiss(4000);
    await silence(800);
    expect(stepNext().textContent).toBe('خلصت ✔');
    await user.click(stepNext());
    expect(screen.getByText('قياس البداية اتحفظ ✔')).toBeTruthy();
    const b = getPath().baseline!;
    expect(b.rangeLow).toBe(50);
    expect(b.rangeHigh).toBe(70);
    expect(b.matchCents).not.toBeNull();
    expect(b.sustainSec).toBeGreaterThan(2);
    expect(b.stabilityCents).not.toBeNull();
    expect(b.hissSec).toBeGreaterThan(3);
    await user.click(button('تمام'));
    expect(screen.getByText('تمرين النهارده')).toBeTruthy();
  });

  it('regression (next-without-doing): pitch matching with fewer than 5 sung tries cannot go next', async () => {
    const { user } = renderApp('path');
    await user.click(button('ابدئي قياس البداية'));
    await user.click(skip());
    await matchTries(user, 2);
    expect(stepNext().disabled).toBe(true);
    expect(screen.getByText(/لسه محتاجين 5 محاولات/)).toBeTruthy();
  });

  it('skipping everything saves nothing and offers to try again', async () => {
    const { user } = renderApp('path');
    await user.click(button('ابدئي قياس البداية'));
    for (let i = 0; i < 5; i++) await user.click(skip());
    expect(screen.getByText(/محفظناش قياس فاضي/)).toBeTruthy();
    expect(getPath().baseline).toBeUndefined();
    await user.click(button('جربي القياس تاني'));
    expect(stepTitle()).toBe('المساحة الصوتية');
  });

  it('a skipped step leaves its numbers empty even if it was half done', async () => {
    const { user } = renderApp('path');
    await user.click(button('ابدئي قياس البداية'));
    await user.click(skip());
    await user.click(skip());
    await user.click(button('ابدئي'));
    await sing(57, 3000);
    await silence(800);
    await user.click(stepNext()); // sustain counted
    await user.click(skip());
    await user.click(skip());
    const b = getPath().baseline!;
    expect(b.sustainSec).toBeGreaterThan(2);
    expect(b.rangeLow).toBeNull();
    expect(screen.getAllByText(/مش متقاس/).length).toBeGreaterThan(0);
  });
});

describe("beginner path: today's workout", () => {
  it('real steps and skipped ones: counts when half are really done, then the throat question', async () => {
    updatePath((p) => (p.baseline = baseline('2026-11-14')));
    const { user } = renderApp('path');
    await user.click(button('كمّلي تمرين النهارده'));
    // 1. today's part of a lesson
    expect(stepTitle()).toBe('درس النهارده');
    const lesson = () => within(document.querySelector('.lesson') as HTMLElement);
    for (let i = 0; i < 10 && !queryButton(/خلصت جزء النهارده/); i++) await user.click(lesson().getByRole('button', { name: 'التالي ←' }));
    await user.click(button(/خلصت جزء النهارده/));
    expect(stepNext().disabled).toBe(false);
    await user.click(stepNext());
    // 2. warm-up skipped
    expect(stepTitle()).toBe('الإحماء');
    await user.click(skip());
    // 3. hiss, real
    await user.click(button('ابدئي'));
    mic.level = 0.002;
    await silence(8200);
    mic.level = 0.3;
    await hiss(4000);
    await silence(800);
    await user.click(stepNext());
    // 4. pitch matching: three sung tries
    await matchTries(user, 3);
    await user.click(stepNext());
    // 5. a held note, real (4 of 7 steps: enough to count)
    expect(stepTitle()).toBe('نغمة مريحة ممدودة');
    await user.click(button('ابدئي'));
    await sing(57, 2500);
    await silence(800);
    await user.click(stepNext());
    // 6–7 skipped
    while (document.querySelector('.step-nav')) await user.click(skip());
    expect(screen.getByText(/حسّيتي بأي وجع/)).toBeTruthy();
    expect(getPath().workouts).toHaveLength(1);
    expect(getPath().workouts[0].done).toBe(4);
    await user.click(button('لأ'));
    expect(screen.getByText(/برافو! كده تمام/)).toBeTruthy();
    expect(getPath().workouts[0].feeling).toBe('no');
  });

  it('fewer than half the steps done: not counted in the streak, and "نجرب تاني" restarts it', async () => {
    updatePath((p) => (p.baseline = baseline('2026-11-14')));
    const { user } = renderApp('path');
    await user.click(button('كمّلي تمرين النهارده'));
    while (document.querySelector('.step-nav')) await user.click(skip());
    expect(screen.getByText(/مش هيتحسب/)).toBeTruthy();
    expect(getPath().workouts).toHaveLength(0);
    await user.click(button('نجرب تاني'));
    expect(screen.getByText(/الخطوة ١ من/)).toBeTruthy();
  });

  it('pain after the last workout: the path suggests resting today', async () => {
    updatePath((p) => {
      p.baseline = baseline('2026-11-10');
      p.workouts = [{ date: '2026-11-14', maqam: 'rast', feeling: 'yes', done: 5 }];
    });
    renderApp('path');
    expect(screen.getByText(/الأحسن تسيبي تمرين النهارده/)).toBeTruthy();
  });

  it('"a little" tiredness makes today lighter (3 steps after the lesson)', async () => {
    updatePath((p) => {
      p.baseline = baseline('2026-11-10');
      p.workouts = [{ date: '2026-11-14', maqam: 'rast', feeling: 'little', done: 5 }];
    });
    renderApp('path');
    expect(screen.getByText(/تمرين أخف/)).toBeTruthy();
  });
});

describe('beginner path: weekly check', () => {
  it('a week after the baseline it asks for the weekly check and compares with the start', async () => {
    updatePath((p) => (p.baseline = baseline('2026-11-07')));
    const { user } = renderApp('path');
    await user.click(button('ابدئي القياس الأسبوعي'));
    await user.click(button('ابدئي الاختبار'));
    await sing(48, 1200);
    await user.click(within(document.querySelector('.embedded')!).getByRole('button', { name: 'التالي ←' }));
    await sing(74, 1200);
    await user.click(button('شوفي النتيجة'));
    await user.click(stepNext());
    for (let i = 0; i < 4; i++) await user.click(skip());
    expect(screen.getByText('نتيجة القياس الأسبوعي')).toBeTruthy();
    expect(screen.getByText('مقارنة بالبداية')).toBeTruthy();
    expect(getPath().weekly).toHaveLength(1);
  });

  it('redoing the baseline asks first, and "لأ" keeps it', async () => {
    updatePath((p) => (p.baseline = baseline('2026-11-14')));
    const { user } = renderApp('path');
    await user.click(button(/إعادة قياس البداية/));
    await user.click(button('لأ'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await user.click(button(/إعادة قياس البداية/));
    await user.click(button(/أيوه، نقيس من الأول/));
    expect(stepTitle()).toBe('المساحة الصوتية');
  });
});
