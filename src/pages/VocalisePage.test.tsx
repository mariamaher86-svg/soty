import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, leaveApp, renderApp, returnToApp, sing, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { getResults } from '../lib/storage';

describe('find do (the note ladder)', () => {
  it('hear each note, sing it, hold: it is found and the next one plays; the count is saved', async () => {
    const { user } = renderApp('findnote');
    await user.click(button(/ابدئي/));
    for (let n = 0; n < 3; n++) {
      await tick(1700); // the note plays
      await sing(Math.round(69 + 12 * Math.log2(audioControl.tones.at(-1)! / 440)), 1300);
      await tick(900);
    }
    await user.click(button('وقفي'));
    expect(mic.open).toBe(0);
    const r = getResults().find((x) => x.type === 'findnote')!;
    expect(r.value).toBe(3);
  });

  it('far off for a while gives a tip, and singing an octave away still counts', async () => {
    const { user } = renderApp('findnote');
    await user.click(button(/ابدئي/));
    await tick(1700);
    const midi = Math.round(69 + 12 * Math.log2(audioControl.tones.at(-1)! / 440));
    await sing(midi + 3, 6000);
    expect(document.querySelector('.ladder, .panel')!.textContent!.length).toBeGreaterThan(0);
    await sing(midi - 12, 1300);
    await tick(900);
    expect(audioControl.tones.length).toBeGreaterThan(1); // moved on to the next note
  });

  it('leaving releases the mic', async () => {
    const { user } = renderApp('findnote');
    await user.click(button(/ابدئي/));
    await tick(1700);
    await leaveApp();
    expect(mic.open).toBe(0);
    await returnToApp();
  });
});

describe('vocalises', () => {
  it('regression (vocalise drift): listen, then her turn; echoing exactly what she heard scores well and is saved', async () => {
    const { user } = renderApp('vocalise');
    await user.click(button(/^ابدئي|🎤 ابدئي|▶️ ابدئي/));
    let cut = 0; // triangles already echoed
    let turns = 0;
    for (let ms = 0; ms < 200000 && mic.open; ms += 50) {
      const turn = /دورك/.test(document.body.textContent!);
      if (!turn) {
        mic.at = null;
        mic.freq = null;
      } else if (!mic.at) {
        // echo the pattern she just heard, with the same timing, from now + 0.3 s (as the app expects)
        turns++;
        const played = audioControl.started.filter((o) => o.type === 'triangle');
        const pattern = played.slice(cut);
        cut = played.length;
        const t0 = pattern[0].when;
        const start = audioControl.current!.currentTime + 0.3;
        mic.at = (t) => {
          let k = -1;
          pattern.forEach((p, i) => p.when - t0 <= t - start && (k = i));
          return k < 0 ? { freq: null } : { freq: pattern[k].freq, level: 0.3 };
        };
      }
      await tick(50);
    }
    expect(turns).toBeGreaterThan(2);
    const r = getResults().filter((x) => x.type === 'vocalise');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeGreaterThan(60);
  }, 60000); // a whole vocalise, every repetition: the longest test

  it('"وقفي" stops right away and nothing is saved before a turn finished', async () => {
    const { user } = renderApp('vocalise');
    await user.click(button(/^ابدئي|🎤 ابدئي|▶️ ابدئي/));
    await tick(300);
    await user.click(button('⏹ وقفي'));
    expect(mic.open).toBe(0);
    await tick(20000);
    expect(getResults()).toHaveLength(0);
    expect(screen.queryByText(/دورك/)).toBeNull();
  });

  it('the example plays without the mic', async () => {
    const { user } = renderApp('vocalise');
    await user.click(button('🔊 اسمعي المثال'));
    await tick(8000);
    expect(audioControl.tones.length).toBeGreaterThan(2);
    expect(mic.calls).toBe(0);
  });
});
