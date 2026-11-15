import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, renderApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { getResults } from '../lib/storage';
import { midiToFreq } from '../lib/music';

describe('dynamics (louder / softer)', () => {
  it('a smooth crescendo on one steady note scores well and is saved', async () => {
    const { user } = renderApp('dynamics');
    await user.click(button(/🎤 ابدئي/));
    await tick(1300); // the note plays
    const t0 = audioControl.current!.currentTime;
    mic.at = (t) => ({ freq: midiToFreq(60), level: 0.01 + Math.min(1, Math.max(0, (t - t0) / 6)) * 0.5 });
    await tick(6500);
    expect(screen.getByText('نعومة العلو')).toBeTruthy();
    const r = getResults().filter((x) => x.type === 'dynamics');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeGreaterThan(50);
    expect(mic.open).toBe(0);
    await user.click(button(/🔁 تاني/));
    await tick(1300);
    expect(mic.open).toBe(1);
  });

  it('silence says it heard nothing and saves nothing', async () => {
    const { user } = renderApp('dynamics');
    await user.click(button(/🎤 ابدئي/));
    await tick(8000);
    expect(screen.getByText(/مسمعناش صوت كفاية/)).toBeTruthy();
    expect(getResults()).toHaveLength(0);
  });

  it('the note can be moved and the kind changed; buttons are off while recording', async () => {
    const { user } = renderApp('dynamics');
    const before = document.querySelector('.note-pick b')!.textContent;
    await user.click(button('أعلى'));
    expect(document.querySelector('.note-pick b')!.textContent).not.toBe(before);
    await user.click(button('واطي ← عالي ← واطي'));
    expect(screen.getByText(/8 ثواني/)).toBeTruthy();
    await user.click(button(/🎤 ابدئي/));
    await tick(1300);
    expect((button('أعلى') as HTMLButtonElement).disabled).toBe(true);
  });
});
