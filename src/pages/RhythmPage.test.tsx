import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, leaveApp, renderApp, returnToApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { getPref, getResults, setPref } from '../lib/storage';

/** Audio-clock times of the metronome clicks scheduled so far (1000 Hz, beat 1 at 1600 Hz). */
const clicks = () => audioControl.started.filter((o) => o.freq === 1000 || o.freq === 1600).map((o) => o.when);

describe('rhythm', () => {
  it('claps exactly on the beat after the count-in score 100 and are saved', async () => {
    setPref('rhythm.latency', '0');
    const { user } = renderApp('rhythm');
    await user.click(button(/▶️ ابدئي/));
    await tick(500); // the first click is scheduled a little ahead
    const first = clicks()[0];
    expect(first).toBeGreaterThan(0);
    const beat = 60 / 70;
    mic.clapAt(Array.from({ length: 8 }, (_, i) => first + (4 + i) * beat));
    expect(document.querySelector('.count-big')).toBeTruthy(); // the count-in shows
    await tick(13 * beat * 1000 + 1500);
    const r = getResults().filter((x) => x.type === 'rhythm');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeGreaterThanOrEqual(90);
    expect(mic.open).toBe(0);
    expect(button(/🔁 تاني/)).toBeTruthy();
  });

  it('no claps scores low (and says so per beat)', async () => {
    setPref('rhythm.latency', '0');
    const { user } = renderApp('rhythm');
    await user.click(button(/▶️ ابدئي/));
    mic.level = 0.001;
    mic.noise = true;
    await tick(13 * (60 / 70) * 1000 + 1500);
    expect(getResults().find((x) => x.type === 'rhythm')!.value).toBeLessThan(20);
    expect(document.querySelectorAll('.rhythm-list li.miss').length).toBeGreaterThan(4);
  });

  it('calibration: clapping with the 12 clicks saves the delay', async () => {
    const { user } = renderApp('rhythm');
    expect(screen.getByText(/ابدئي بـ «👏 ظبطي التأخير»/)).toBeTruthy();
    await user.click(button('👏 ظبطي التأخير'));
    await tick(200);
    const first = clicks()[0];
    const beat = 60 / 90;
    mic.clapAt(Array.from({ length: 12 }, (_, i) => first + i * beat + 0.08)); // 80 ms late
    await tick(13 * beat * 1000 + 1000);
    const saved = Number(getPref('rhythm.latency'));
    expect(saved).toBeGreaterThan(0.05);
    expect(saved).toBeLessThan(0.12);
    expect(screen.getByText(/التأخير المحفوظ/)).toBeTruthy();
  });

  it('calibration without claps says it heard nothing', async () => {
    const { user } = renderApp('rhythm');
    await user.click(button('👏 ظبطي التأخير'));
    await tick(12 * (60 / 90) * 1000 + 1500);
    expect(screen.getByText(/مسمعناش تصقيف كفاية/)).toBeTruthy();
  });

  it('the metronome starts, changes tempo and stops; leaving stops it too', async () => {
    const { user } = renderApp('rhythm');
    await user.click(button(/شغّلي المترونوم/));
    await tick(2000);
    const n = clicks().length;
    expect(n).toBeGreaterThan(1);
    await user.click(button(/3 في المازورة|٣ في المازورة/));
    await tick(1000);
    await user.click(button(/وقفي المترونوم/));
    const stopped = clicks().length;
    await tick(2000);
    expect(clicks().length).toBe(stopped);
    await user.click(button(/شغّلي المترونوم/));
    await tick(500);
    await leaveApp();
    const atLeave = clicks().length;
    await tick(2000);
    expect(clicks().length - atLeave).toBeLessThanOrEqual(1);
    await returnToApp();
  });
});
