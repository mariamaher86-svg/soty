import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, buttons, leaveApp, renderApp, returnToApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { addEarAnswer, getEarHistory, getResults } from '../lib/storage';

const answerButtons = () => [...document.querySelectorAll('.answers button')] as HTMLButtonElement[];

/** Level 1: answer right by comparing the two notes that were played. */
async function answerPitch(user: ReturnType<typeof renderApp>['user'], right = true) {
  const [a, b] = audioControl.tones.slice(-2);
  const higher = b > a;
  await user.click(button(higher === right ? /التانية أعلى/ : /التانية أوطى/));
}

describe('ear training', () => {
  it('level 1: hear two notes, answer, see if right, next question; 10 answers are saved as a block', async () => {
    const { user } = renderApp('ear');
    await user.click(button(/ابدئي/));
    await tick(3000);
    await answerPitch(user);
    expect(screen.getByText(/✔ صح/)).toBeTruthy();
    for (let i = 0; i < 9; i++) {
      await user.click(button(/السؤال اللي بعده/));
      await tick(3000);
      await answerPitch(user, i !== 0); // one wrong
    }
    expect(screen.getByText(/النهارده: 9 صح من 10/)).toBeTruthy();
    const r = getResults().filter((x) => x.type === 'ear-pitch');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe(90);
    expect(getEarHistory().pitch).toHaveLength(10);
  });

  it('a wrong answer shows the right one and offers to hear both', async () => {
    const { user } = renderApp('ear');
    await user.click(button(/ابدئي/));
    await tick(3000);
    await answerPitch(user, false);
    expect(screen.getByText(/✘ الإجابة الصح/)).toBeTruthy();
    expect(button(/اسمعيهم تاني/)).toBeTruthy();
  });

  it('answers can be tapped while the notes still play (a sound that never ends cannot lock them)', async () => {
    const { user } = renderApp('ear');
    await user.click(button(/ابدئي/));
    await tick(100);
    expect(answerButtons().every((b) => !b.disabled)).toBe(true);
    audioControl.current!.suspendNow(); // the audio stops mid-note
    await user.click(answerButtons()[0]);
    expect(document.querySelector('.guide')!.textContent).toMatch(/صح|الإجابة الصح/);
  });

  it('regression (ear-training lock): answer, next, leave and come back, then carry on', async () => {
    const { user } = renderApp('ear');
    await user.click(button(/ابدئي/));
    await tick(3000);
    await answerPitch(user);
    await user.click(button(/السؤال اللي بعده/));
    await tick(200); // leaving while the next question plays
    await leaveApp();
    audioControl.current!.interrupt();
    await returnToApp();
    await user.click(button(/ابدئي/));
    await tick(9000); // even a stuck context settles
    expect(answerButtons().length).toBe(2);
    expect(answerButtons().every((b) => !b.disabled)).toBe(true);
    await user.click(answerButtons()[0]);
    expect(button(/السؤال اللي بعده/)).toBeTruthy();
  });

  it('"اسمعي تاني" replays the same notes and does not reopen an answered question', async () => {
    const { user } = renderApp('ear');
    await user.click(button(/ابدئي/));
    await tick(3000);
    const first = audioControl.tones.slice(-2);
    await user.click(button(/اسمعي تاني/));
    await tick(3000);
    expect(audioControl.tones.slice(-2)).toEqual(first);
    await answerPitch(user);
    await user.click(button(/اسمعي تاني/));
    expect(answerButtons().every((b) => b.disabled)).toBe(true);
  });

  it('locked levels stay locked until 8 of the last 10 are right in the level before', async () => {
    renderApp('ear');
    const chip = (n: string) => buttons(new RegExp(n))[0] as HTMLButtonElement;
    expect(chip('2\\. زي بعض').disabled).toBe(true);
  });

  for (const level of [
    { n: 2, name: 'زي بعض ولا لأ', options: 2 },
    { n: 3, name: 'المسافات', options: 3 },
    { n: 4, name: 'أنهي مقام', options: 3 },
  ]) {
    it(`level ${level.n} (${level.name}) works start to finish`, async () => {
      for (const id of ['pitch', 'same', 'interval'] as const) for (let i = 0; i < 10; i++) addEarAnswer(id, true);
      const { user } = renderApp('ear');
      await user.click(button(new RegExp(`${level.n}\\. ${level.name}`)));
      await user.click(button(/ابدئي/));
      await tick(9000);
      expect(answerButtons().length).toBeGreaterThanOrEqual(2);
      await user.click(answerButtons()[0]);
      expect(screen.getByText(/✔ صح|✘ الإجابة الصح/)).toBeTruthy();
      expect(document.querySelectorAll('.row button').length).toBeGreaterThan(0); // hear-the-difference buttons
      await user.click(button(/السؤال اللي بعده/));
      await tick(9000);
      expect(answerButtons().every((b) => !b.disabled)).toBe(true);
    });
  }

  it('leaving the page saves an unfinished block of at least 5', async () => {
    const { user } = renderApp('ear');
    await user.click(button(/ابدئي/));
    for (let i = 0; i < 6; i++) {
      await tick(3000);
      await answerPitch(user);
      await user.click(button(/السؤال اللي بعده/));
    }
    window.location.hash = '#/exercises';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await tick(50);
    expect(getResults().filter((x) => x.type === 'ear-pitch')[0].value).toBe(100);
  });
});
