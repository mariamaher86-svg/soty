import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, leaveApp, renderApp, returnToApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { addIntervalAnswer, getIntervalHistory, getResults } from '../lib/storage';

/** "💡 اسمعي الإجابة" plays the reference then the answer: sing that last note. */
async function singAnswer(user: ReturnType<typeof renderApp>['user'], cents = 0) {
  await user.click(button(/اسمعي الإجابة/));
  await tick(2500);
  mic.freq = audioControl.tones.at(-1)! * Math.pow(2, cents / 1200);
  await tick(1500);
}

describe('interval singing', () => {
  it('hear the note, sing the interval, hold it: right; next; a skip is wrong; 10 answers are saved', async () => {
    const { user } = renderApp('intervals');
    await user.click(button(/ابدئي/));
    await tick(1600);
    await singAnswer(user);
    expect(screen.getByText(/برافو/)).toBeTruthy();
    for (let i = 0; i < 9; i++) {
      await user.click(button(/اللي بعدها/));
      await tick(1600);
      if (i < 2) await user.click(button('تخطي'));
      else await singAnswer(user);
    }
    const h = getIntervalHistory()[0]!;
    expect(h).toHaveLength(10);
    expect(h.filter(Boolean)).toHaveLength(8);
    expect(getResults().filter((r) => r.type === 'intervals')[0].value).toBe(80);
  });

  it('off by 40 cents does not count', async () => {
    const { user } = renderApp('intervals');
    await user.click(button(/ابدئي/));
    await tick(1600);
    await singAnswer(user, 40);
    expect(screen.queryByText(/برافو/)).toBeNull();
  });

  it('levels unlock after 8 of 10 in the level before', async () => {
    for (let i = 0; i < 10; i++) addIntervalAnswer(0, true);
    const { user } = renderApp('intervals');
    const chip = (n: number) => [...document.querySelectorAll('.choices button')].find((b) => b.textContent!.replace('🔒 ', '').startsWith(`${n}.`)) as HTMLButtonElement;
    const l2 = chip(2);
    expect(l2.disabled).toBe(false);
    expect(chip(3).disabled).toBe(true);
    await user.click(l2);
    expect(screen.getByText(/المستوى 2/)).toBeTruthy();
  });

  it('leaving mid-task releases the mic; coming back works again', async () => {
    const { user } = renderApp('intervals');
    await user.click(button(/ابدئي/));
    await tick(1600);
    await leaveApp();
    expect(mic.open).toBe(0);
    await returnToApp();
    await user.click(button(/ابدئي/));
    await tick(1600);
    await singAnswer(user);
    expect(screen.getByText(/برافو/)).toBeTruthy();
  });
});
