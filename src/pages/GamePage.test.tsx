import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, leaveApp, renderApp, returnToApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { getPref, getResults } from '../lib/storage';

/** Play the whole course: each hint note plays 1.2 s before its gate, so sing it from then on. */
async function playCourse(follow = true) {
  let seen = 0;
  const due: { at: number; freq: number }[] = [];
  for (let ms = 0; ms < 120000 && !document.querySelector('.panel.center .stat'); ms += 100) {
    const tones = audioControl.tones.filter((f) => f > 0);
    for (; seen < tones.length; seen++) due.push({ at: Date.now() + 1200, freq: tones[seen] });
    const now = due.filter((d) => d.at <= Date.now()).at(-1);
    mic.freq = follow && now ? now.freq : null;
    await tick(100);
  }
}

describe('the voice game', () => {
  it('following the gates with her voice scores well; the result and the best score are saved', async () => {
    const { user } = renderApp('game');
    await user.click(button(/ابدئي اللعب/));
    expect(mic.open).toBe(1);
    await playCourse(true);
    const r = getResults().filter((x) => x.type === 'game');
    expect(r).toHaveLength(1);
    expect(Number(r[0].detail!.match(/(\d+)%/)![1])).toBeGreaterThan(50);
    expect(screen.getByText(/أعلى نتيجة ليكي/)).toBeTruthy();
    expect(Number(getPref('game.best.1'))).toBe(r[0].value);
    expect(mic.open).toBe(0);
    await user.click(button(/العبي تاني/));
    expect(mic.open).toBe(1);
  });

  it('silence just scores low: no loss, no crash', async () => {
    const { user } = renderApp('game');
    await user.click(button(/ابدئي اللعب/));
    await playCourse(false);
    expect(getResults().find((x) => x.type === 'game')!.value).toBe(0);
  });

  it('pause and continue; "خلاص" ends without saving', async () => {
    const { user } = renderApp('game');
    await user.click(button(/ابدئي اللعب/));
    await tick(1000);
    await user.click(button('⏸ وقفي'));
    expect(mic.open).toBe(0);
    expect(screen.getByText('واقفة')).toBeTruthy();
    await user.click(button('▶️ كمّلي'));
    expect(mic.open).toBe(1);
    await user.click(button('⏸ وقفي'));
    await user.click(button('خلاص'));
    expect(getResults()).toHaveLength(0);
    expect(button(/ابدئي اللعب/)).toBeTruthy();
  });

  it('leaving the app pauses the game (mic off), and it continues on return', async () => {
    const { user } = renderApp('game');
    await user.click(button(/ابدئي اللعب/));
    await tick(500);
    await leaveApp();
    expect(mic.open).toBe(0);
    await returnToApp();
    expect(crashFree()).toBe(true);
  });

  it('the hint notes can be turned off, and the level is remembered', async () => {
    const { user } = renderApp('game');
    await user.click(button(/2\. دو ري مي/));
    expect(getPref('game.level')).toBe('2');
    await user.click(screen.getByLabelText(/اسمعي النغمة قبل كل بوابة/));
    expect(getPref('game.hints')).toBe('0');
    await user.click(button(/ابدئي اللعب/));
    await tick(8000);
    expect(audioControl.tones).toHaveLength(0);
  });

  it('a denied mic shows why', async () => {
    mic.deny = 'NotAllowedError';
    const { user } = renderApp('game');
    await user.click(button(/ابدئي اللعب/));
    expect(screen.getByText(/الميكروفون مقفول/)).toBeTruthy();
  });
});

const crashFree = () => !document.querySelector('.crash-screen');
