import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, inOptions, leaveApp, renderApp, returnToApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { getResults } from '../lib/storage';

describe('maqamat', () => {
  it('each degree plays; singing it exactly (quarter tones too) marks it ok; all done saves 100%', async () => {
    const { user } = renderApp('maqam');
    await user.click(screen.getAllByRole('button', { name: 'راست' })[0]);
    await inOptions(user, () => user.click(screen.getAllByRole('button', { name: 'صعود' })[0]));
    await user.click(button(/ابدئي/));
    for (let i = 0; i < 20 && mic.open; i++) {
      await tick(1300);
      mic.freq = audioControl.tones.at(-1)!;
      await tick(1400);
      mic.freq = null;
    }
    const r = getResults().filter((x) => x.type === 'maqam');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe(100);
    expect(r[0].detail).toBe('راست');
  });

  it('a degree sung as the nearest piano key (not the quarter tone) does not pass; skip moves on', async () => {
    const { user } = renderApp('maqam');
    await user.click(screen.getAllByRole('button', { name: 'راست' })[0]);
    await inOptions(user, () => user.click(screen.getAllByRole('button', { name: 'صعود' })[0]));
    await user.click(button(/ابدئي/));
    for (let d = 0; d < 3; d++) {
      await tick(1300);
      const target = audioControl.tones.at(-1)!;
      // the third (E half-flat): sing a plain E instead
      mic.freq = d === 2 ? target * Math.pow(2, 50 / 1200) : target;
      await tick(1400);
    }
    expect(document.querySelectorAll('.degrees li.ok').length).toBe(2);
    await user.click(button('تخطي'));
    await tick(50);
    expect(document.querySelectorAll('.degrees li.skip, .degrees li.miss').length).toBeGreaterThan(0);
  });

  it('the tonic can be moved, the scale heard, and the run cancelled', async () => {
    const { user } = renderApp('maqam');
    await inOptions(user, () => user.click(button('القرار أعلى')));
    await user.click(button(/اسمعي المقام/));
    await tick(6000);
    expect(audioControl.tones.length).toBeGreaterThan(7);
    await user.click(button(/ابدئي/));
    await tick(200);
    await user.click(screen.getByRole('button', { name: /إلغاء|وقفي/ }));
    expect(mic.open).toBe(0);
  });

  it('leaving mid-run releases the mic', async () => {
    const { user } = renderApp('maqam');
    await user.click(button(/ابدئي/));
    await tick(500);
    await leaveApp();
    expect(mic.open).toBe(0);
    await returnToApp();
    expect(button(/ابدئي/)).toBeTruthy();
  });
});
