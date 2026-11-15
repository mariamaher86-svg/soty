import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, crashed, leaveApp, queryButton, renderApp, returnToApp, sing, tick } from '../test/app';
import { mic } from '../test/fakeMic';
import { audioControl } from '../test/fakeAudio';
import { getResults } from '../lib/storage';
import { noteName } from '../lib/music';

/** the MIDI note shown as the target */
function target(): number {
  const name = document.querySelector('.target-note span')!.textContent!;
  for (let m = 36; m < 90; m++) if (noteName(m) === name) return m;
  throw new Error('no target ' + name);
}

describe('pitch matching', () => {
  it('a full round: hear, sing, hold, next, end and save', async () => {
    const { user } = renderApp('match');
    expect(crashed()).toBe(false);
    await user.click(button('ابدئي'));
    await tick(1600); // the note plays
    expect(mic.open).toBe(1);
    await sing(target(), 1500);
    expect(screen.getByText(/برافو/)).toBeTruthy();
    await user.click(button(/النغمة اللي بعدها/));
    await tick(1600);
    await user.click(button('تخطي')); // a miss
    await tick(1600);
    await user.click(button(/إنهاء الجلسة/));
    expect(mic.open).toBe(0);
    expect(screen.getByText(/الجلسة اتحفظت/)).toBeTruthy();
    const r = getResults().filter((x) => x.type === 'match');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe(50);
  });

  it('singing off by 40 cents is not a hit', async () => {
    const { user } = renderApp('match');
    await user.click(button('ابدئي'));
    await tick(1600);
    await sing(target(), 2000, 40);
    expect(screen.queryByText(/برافو/)).toBeNull();
    expect(button('تخطي')).toBeTruthy();
  });

  it('"اسمعيها تاني" plays the note again and the round still works', async () => {
    const { user } = renderApp('match');
    await user.click(button('ابدئي'));
    await tick(1600);
    const before = audioControl.current!.nodes.size;
    await user.click(button(/اسمعيها تاني/));
    expect(audioControl.current!.nodes.size).toBeGreaterThan(before);
    await tick(1600);
    await sing(target(), 1500);
    expect(screen.getByText(/برافو/)).toBeTruthy();
  });

  it('a denied microphone shows a message instead of hanging', async () => {
    mic.deny = 'NotAllowedError';
    const { user } = renderApp('match');
    await user.click(button('ابدئي'));
    await tick(1600);
    expect(screen.getByText(/الميكروفون مقفول/)).toBeTruthy();
    expect(crashed()).toBe(false);
  });

  it('leaving the app mid-round releases the mic, and the page starts fresh on return', async () => {
    const { user } = renderApp('match');
    await user.click(button('ابدئي'));
    await tick(1600);
    await leaveApp();
    expect(mic.open).toBe(0);
    await returnToApp();
    expect(screen.getByText(/وقفنا اللي كان شغال/)).toBeTruthy();
    await user.click(button('ابدئي'));
    await tick(1600);
    expect(mic.open).toBe(1);
    await sing(target(), 1500);
    expect(screen.getByText(/برافو/)).toBeTruthy();
  });

  it('regression (frozen after returning): a context stuck after the background still lets notes finish', async () => {
    const { user } = renderApp('match');
    await user.click(button('ابدئي'));
    await tick(1600);
    await leaveApp();
    audioControl.current!.interrupt();
    audioControl.stuck = true;
    await returnToApp();
    await user.click(button('ابدئي'));
    await tick(9000);
    expect(queryButton('تخطي')).toBeTruthy();
    expect(audioControl.contexts.length).toBeGreaterThan(1); // a fresh context was made in the tap
  });

  it('the mic track ending by itself (a call) asks to start again', async () => {
    const { user } = renderApp('match');
    await user.click(button('ابدئي'));
    await tick(1600);
    mic.endAll();
    await tick(100);
    expect(screen.getByText(/المايك وقف/)).toBeTruthy();
  });
});
