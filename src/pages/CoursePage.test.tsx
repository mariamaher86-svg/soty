// "🎓 كورس الصوت" screens: the levels, a level, an exercise (goal, how, example, the real exercise, passing on two
// days), the placement check, a piano-vocalise exercise, and the course line in Progress.
import { describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { button, go, hiss, main, renderApp, sing, silence, tick } from '../test/app';
import { mic } from '../test/fakeMic';
import { audioControl } from '../test/fakeAudio';
import { noteName } from '../lib/music';
import { getResults, setPref } from '../lib/storage';
import { getCourse } from '../lib/course';

const target = () => {
  const name = document.querySelector('.target-note span')!.textContent!;
  for (let m = 36; m < 90; m++) if (noteName(m) === name) return m;
  throw new Error('no target');
};

const lastGo = () => document.querySelector('.course-last')?.textContent ?? '';

/** A 9-second ssss after the guided inhale and hold (the breath goal is 8 s). */
async function longHiss(user: UserEvent) {
  await user.click(button(/^(ابدئي|مرة كمان)$/));
  mic.level = 0.002;
  await silence(8200);
  mic.level = 0.3;
  await hiss(9500);
  await silence(800);
}

describe('voice course: the levels', () => {
  it('starts at level 1 of 8 with the next exercise; later levels are locked; safety notes are there', () => {
    renderApp('course');
    expect(screen.getByText('المستوى ١ من ٨')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'الجاي: الوقفة والنفس من البطن' }).getAttribute('href')).toBe('#/course/ex/l1-breath');
    expect(main().getByRole('link', { name: /المستوى ١: الأساس/ })).toBeTruthy();
    expect(main().queryByRole('link', { name: /المستوى ٢:/ })).toBeNull();
    expect(document.querySelectorAll('.course-levels .locked')).toHaveLength(8); // levels 2–8 and the graduation
    expect(screen.getByText(/لو حاجة وجعت/)).toBeTruthy();
    expect(getCourse().reached[1]).toBe('2026-11-15');
  });

  it('reachable from the exercises list and the home screen', async () => {
    renderApp('exercises/start');
    expect(document.querySelector('main a[href="#/course"]')).toBeTruthy();
    await go('');
    expect(screen.getByRole('link', { name: /المستوى ١ من ٨: الأساس/ }).getAttribute('href')).toBe('#/course');
  });

  it('a level: its goal, "why it matters", every exercise with its goal, and the placement check on her level', () => {
    renderApp('course/1');
    expect(screen.getByText(/تقفي صح، تتنفسي من بطنك/)).toBeTruthy();
    expect(screen.getByText(/ليه المستوى ده مهم/)).toBeTruthy();
    expect(screen.getAllByText(/🎯/).length).toBe(3);
    expect(screen.getByRole('link', { name: 'أنا عارفة المستوى ده — امتحنيني' }).getAttribute('href')).toBe('#/course/exam/1');
  });

  it('a locked level cannot be opened by its address', () => {
    renderApp('course/3');
    expect(screen.getByText(/المستوى ده لسه مقفول/)).toBeTruthy();
    cleanup();
    renderApp('course/ex/l3-arp');
    expect(screen.getByText(/المستوى ده لسه مقفول/)).toBeTruthy();
  });

  it('the high/low level shows its safety note', () => {
    setPref('course', JSON.stringify({ passes: {}, placed: { 1: '2026-11-01', 2: '2026-11-01', 3: '2026-11-01', 4: '2026-11-01', 5: '2026-11-01', 6: '2026-11-01' }, reached: {} }));
    renderApp('course/7');
    expect(screen.getByText(/متزقيش صوتك أبدًا/)).toBeTruthy();
  });
});

describe('voice course: one exercise', () => {
  it('shows the goal before starting, the steps, the video search; reaching the goal counts once a day, and a second day passes it', async () => {
    const { user, unmount } = renderApp('course/ex/l1-breath');
    expect(screen.getByText(/الهدف:/).parentElement!.textContent).toMatch(/٨ ثواني أو أكتر في مرة واحدة/);
    expect(screen.getByText(/لحد دلوقتي: ٠ من ٢/)).toBeTruthy();
    expect(document.querySelectorAll('.course-how li')).toHaveLength(3);
    expect(document.querySelector('a[href*="youtube.com/results"]')).toBeTruthy();
    // the back button goes to the level
    expect(document.querySelector('.topbar a.back')!.getAttribute('href')).toBe('#/course/1');
    await longHiss(user);
    expect(lastGo()).toMatch(/وصلتي للهدف/);
    expect(screen.getByText(/ارجعي يوم تاني عشان يتثبت/)).toBeTruthy();
    expect(getCourse().passes['l1-breath']).toEqual(['2026-11-15']);
    // again the same day: still one day
    await longHiss(user);
    expect(getCourse().passes['l1-breath']).toEqual(['2026-11-15']);
    unmount();
    // the next day
    vi.setSystemTime(new Date('2026-11-16T09:00:00'));
    const second = renderApp('course/ex/l1-breath');
    await longHiss(second.user);
    expect(getCourse().passes['l1-breath']).toEqual(['2026-11-15', '2026-11-16']);
    expect(screen.getByText(/التمرين ده اتعدّى/)).toBeTruthy();
    await go('course/1');
    expect(screen.getAllByText(/✔ اتعدّى/)).toHaveLength(1);
  });

  it('a short go is counted as a try, not as the goal', async () => {
    const { user } = renderApp('course/ex/l1-hum');
    await user.click(button('ابدئي'));
    await sing(57, 2500);
    await silence(800);
    expect(lastGo()).toMatch(/قربتي/);
    expect(getCourse().passes['l1-hum']).toBeUndefined();
  });

  it('"🔊 اسمعي المثال" plays the note and lights it on the piano', async () => {
    const { user } = renderApp('course/ex/l1-hum');
    const before = audioControl.tones.length;
    await user.click(button('🔊 اسمعي المثال'));
    await tick(300);
    expect(audioControl.tones.length).toBeGreaterThan(before);
    expect(document.querySelector('.course-demo .pkey.target')).toBeTruthy();
  });
});

describe('voice course: "امتحنيني" (placement check)', () => {
  it('meeting every goal of level 1 in one go passes the level and opens level 2', async () => {
    const { user } = renderApp('course/exam/1');
    expect(screen.getByText(/التمرين ١ من ٣/)).toBeTruthy();
    const next = () => button(/التمرين اللي بعده ←|خلصت ✔/) as HTMLButtonElement;
    expect(next().disabled).toBe(true);
    // 1. breath
    await longHiss(user);
    expect(next().disabled).toBe(false);
    await user.click(next());
    // 2. humming 5 seconds
    await user.click(button('ابدئي'));
    await sing(57, 5000);
    await silence(800);
    expect(next().disabled).toBe(false);
    await user.click(next());
    // 3. one note, 5 tries all right
    expect(document.querySelector('.step-count')!.textContent).toBe('التمرين ٣ من ٣');
    await user.click(button('ابدئي'));
    await tick(1600);
    for (let i = 0; i < 5; i++) {
      await sing(target(), 1400);
      if (i < 4) {
        await user.click(button(/النغمة اللي بعدها/));
        await tick(1600);
      }
    }
    await user.click(next());
    expect(screen.getByText(/عدّيتي المستوى ١/)).toBeTruthy();
    expect(getCourse().placed[1]).toBe('2026-11-15');
    await go('course');
    expect(screen.getByText('المستوى ٢ من ٨')).toBeTruthy();
    expect(main().getByRole('link', { name: /المستوى ١: الأساس/ }).textContent).toMatch(/بالامتحان/);
  });

  it('stopping early passes nothing, but the goals reached still count as good days', async () => {
    const { user } = renderApp('course/exam/1');
    await longHiss(user);
    await user.click(button('وقفي الامتحان'));
    expect(screen.getByText(/وصلتي لهدف ١ من ٣/)).toBeTruthy();
    expect(getCourse().placed[1]).toBeUndefined();
    expect(getCourse().passes['l1-breath']).toEqual(['2026-11-15']);
  });

  it('only her current level can be examined', () => {
    renderApp('course/exam/2');
    expect(screen.getByText(/لمستواكي الحالي بس/)).toBeTruthy();
  });
});

describe('voice course: a piano exercise', () => {
  it('fixed pattern and tempo (no picker), her turn note by note, and a good round reaches the goal', async () => {
    setPref('course', JSON.stringify({ passes: {}, placed: { 1: '2026-11-10' }, reached: {} }));
    const { user } = renderApp('course/ex/l2-five');
    expect(screen.queryByText('🎶 فوكاليز على البيانو')).toBeNull();
    expect(screen.getByText(/الهدف:/).parentElement!.textContent).toMatch(/٧ من ٩ نغمات/);
    await user.click(button('🎤 دورك'));
    await tick(1300);
    for (let ms = 0; ms < 40000 && !getResults().some((r) => r.type === 'piano-vocalise'); ms += 100) {
      const now = document.querySelector('.pkey.target') as HTMLElement | null;
      if (now) mic.sing(Number(now.dataset.midi));
      await tick(100);
    }
    expect(getCourse().passes['l2-five']).toEqual(['2026-11-15']);
    expect(lastGo()).toMatch(/من ٩ نغمات مظبوطة — وصلتي للهدف/) // (emoji are left out of body text);
  });
});

describe('voice course in Progress', () => {
  it('a line with the day each level opened', () => {
    setPref('course', JSON.stringify({ passes: {}, placed: { 1: '2026-11-10' }, reached: { 1: '2026-11-01', 2: '2026-11-10' } }));
    renderApp('progress');
    expect(screen.getByText(/كورس الصوت — المستويات/)).toBeTruthy();
    expect(screen.getByText(/دلوقتي: المستوى ٢ من ٨/)).toBeTruthy();
    expect(document.querySelectorAll('.course-line circle')).toHaveLength(2);
  });
});
