import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, go, leaveApp, renderApp, returnToApp, sing, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { getResults } from '../lib/storage';

const key = (label: string) => document.querySelector(`.pkey[aria-label^="${label}"]`) as HTMLButtonElement;
const lastMidi = () => Math.round(69 + 12 * Math.log2(audioControl.tones.at(-1)! / 440));

describe('piano: choose a key and sing it', () => {
  it('tap a key: it plays and is chosen; sing it and hold: ✔; the session is saved when leaving', async () => {
    const { user } = renderApp('piano');
    await user.click(key('مي E4'));
    await tick(1300);
    expect(lastMidi()).toBe(64);
    expect(key('مي E4').classList.contains('target')).toBe(true);
    await user.click(button(/غنّي النغمة دي/));
    await tick(1300);
    await sing(64, 1500);
    expect(screen.getByText('✔ مظبوط!')).toBeTruthy();
    expect(document.querySelector('.pkey.hit-target')).toBeTruthy();
    await user.click(button('غنّيها تاني'));
    await sing(64, 1500, 45); // too far off
    expect(screen.queryByText('✔ مظبوط!')).toBeNull();
    await user.click(button('⏹ وقفي'));
    expect(mic.open).toBe(0);
    await go('exercises');
    const r = getResults().filter((x) => x.type === 'piano');
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/^1\/2/);
  });

  it('a whole octave off: it says so and moves the note to her octave', async () => {
    const { user } = renderApp('piano');
    await user.click(key('مي E5'));
    await user.click(button(/غنّي النغمة دي/));
    await tick(1300);
    await sing(64, 1500);
    expect(screen.getByText(/بتغني أوطى بأوكتاف/)).toBeTruthy();
    await user.click(button('غنّيها في الأوكتاف بتاعي'));
    await tick(1300);
    await sing(64, 1500);
    expect(screen.getByText('✔ مظبوط!')).toBeTruthy();
  });

  it('quarter tones: E half-flat plays 50 cents lower and is judged on it', async () => {
    const { user } = renderApp('piano');
    await user.click(key('مي E4'));
    await tick(1300);
    await user.click(button('خيارات'));
    await user.click(button('نص بيمول'));
    await user.click(button('قفل الخيارات'));
    await tick(1300);
    expect(audioControl.tones.at(-1)!).toBeCloseTo(329.63 * Math.pow(2, -50 / 1200), 1);
    await user.click(button(/غنّي النغمة دي/));
    await tick(1300);
    await sing(64, 1500, -50);
    expect(screen.getByText('✔ مظبوط!')).toBeTruthy();
  });

  it('"ورّيني كل ال..." lights every key with the same name', async () => {
    const { user } = renderApp('piano');
    await user.click(key('صول G4'));
    await user.click(button(/ورّيني كل الصول/));
    expect(document.querySelectorAll('.pkey.same').length).toBeGreaterThan(3);
  });

  it('regression (piano silent after returning): after the app was in the background, a key still sounds', async () => {
    const { user } = renderApp('piano');
    await user.click(key('دو C4'));
    await tick(1300);
    await leaveApp();
    audioControl.current!.interrupt();
    await returnToApp();
    const before = audioControl.tones.length;
    await user.click(key('ري D4'));
    await tick(50);
    expect(audioControl.tones.length).toBe(before + 1);
    expect(audioControl.current!.state).toBe('running');
  });
});

describe('piano: show me what I sing', () => {
  it('the key she sings lights up with how far off it is', async () => {
    const { user } = renderApp('piano');
    await user.click(button(/وريني بغني إيه/));
    expect(mic.open).toBe(1);
    await sing(67, 500, 10);
    expect(document.querySelector('.piano-label')!.textContent).toMatch(/صول — G4/);
    expect(screen.getByText(/\+10 سنت/)).toBeTruthy();
    expect(document.querySelector('.pkey.hit')?.getAttribute('aria-label')).toMatch(/^صول G4/);
    await user.click(key('لا A4')); // in this mode a tap only plays
    await tick(1100);
    expect(lastMidi()).toBe(69);
    await user.click(button(/اختاري وغنّي/));
    expect(mic.open).toBe(0);
  });
});

describe('piano vocalises', () => {
  it('listen lights the keys; her turn follows note by note and saves a score', async () => {
    const { user } = renderApp('piano');
    await user.click(button(/🎶 فوكاليز/));
    await user.click(button('🔊 اسمعي'));
    const start = audioControl.tones.length;
    await tick(15000);
    const pattern = audioControl.tones.slice(start).map((f) => Math.round(69 + 12 * Math.log2(f / 440)));
    expect(pattern.length).toBeGreaterThan(2);
    await user.click(button('🎤 دورك'));
    await tick(1300);
    // follow the key the piano marks as "now", like she would
    for (let ms = 0; ms < 30000 && !getResults().length; ms += 100) {
      const now = document.querySelector('.pkey.target') as HTMLElement | null;
      if (now) mic.sing(Number(now.dataset.midi));
      await tick(100);
    }
    const r = getResults().filter((x) => x.type === 'piano-vocalise');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeGreaterThanOrEqual(80);
    expect(button(/تاني نفس الطبقة/)).toBeTruthy();
  });

  it('"⏹ وقفي" stops listening and the mic', async () => {
    const { user } = renderApp('piano');
    await user.click(button(/🎶 فوكاليز/));
    await user.click(button('🎤 دورك'));
    await tick(200);
    await user.click(button('⏹ وقفي'));
    expect(mic.open).toBe(0);
    expect(button('🎤 دورك')).toBeTruthy();
  });

  it('a maqam scale can be chosen as the pattern', async () => {
    const { user } = renderApp('piano');
    await user.click(button(/🎶 فوكاليز/));
    await user.click(button('غيّري التمرين')); // the other patterns are behind it
    await user.click(button(/سلم مقام/));
    await user.click(screen.getAllByRole('button', { name: 'راست' })[0]);
    await user.click(button('🔊 اسمعي'));
    await tick(20000);
    // Rast has a three-quarter-tone step (E half-flat to F): 150 cents
    const f = audioControl.tones;
    const steps = f.slice(1).map((x, i) => Math.round(Math.abs(1200 * Math.log2(x / f[i]))));
    expect(steps).toContain(150);
  });
});
