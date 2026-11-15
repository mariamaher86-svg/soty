import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { button, leaveApp, renderApp, returnToApp, sing, silence, tick } from '../test/app';
import { mic } from '../test/fakeMic';
import { noteName } from '../lib/music';

const nav = () => within(document.querySelector('.step-nav') as HTMLElement);
const next = () => nav().getByRole('button', { name: 'الجزء اللي بعده ←' }) as HTMLButtonElement;

describe('warm-up', () => {
  it('trill, siren and hum with her voice, then "صوتك سخن"', async () => {
    const { user } = renderApp('warmup');
    // 1. trill: loudness only
    await user.click(button('ابدئي'));
    expect(next().disabled).toBe(true);
    mic.level = 0.002;
    await silence(1000);
    mic.level = 0.3;
    await sing(55, 7000);
    expect(next().disabled).toBe(false);
    await user.click(next());
    expect(mic.open).toBe(0);
    // 2. siren
    expect(screen.getByRole('heading', { name: /السيرينة/ })).toBeTruthy();
    await user.click(button('ابدئي'));
    await sing(57, 12000);
    await user.click(button('⏹ كفاية'));
    expect(screen.getByText(/عن الخط في المتوسط/)).toBeTruthy();
    expect(next().disabled).toBe(false);
    await user.click(next());
    // 3. hum: sing each note it plays
    expect(screen.getByRole('heading', { name: /الهمهمة/ })).toBeTruthy();
    const notes = [...document.querySelectorAll('.degrees li span')].map((s) => {
      for (let m = 36; m < 90; m++) if (noteName(m) === s.textContent) return m;
      return 0;
    });
    await user.click(button('ابدئي'));
    for (const n of notes) {
      await silence(1400); // the note plays
      await sing(n, 4100);
    }
    expect(document.querySelectorAll('.degrees li.ok').length).toBe(notes.length);
    await user.click(next());
    expect(screen.getByText(/صوتك سخن/)).toBeTruthy();
    expect(mic.open).toBe(0);
    await user.click(button('عيدي الإحماء'));
    expect(screen.getByRole('heading', { name: /ترعيش الشفايف/ })).toBeTruthy();
  });

  it('"next" stays off until something real was heard; skipping goes on without it', async () => {
    const { user } = renderApp('warmup');
    await user.click(button('ابدئي'));
    await silence(6000);
    expect(next().disabled).toBe(true);
    await user.click(nav().getByRole('button', { name: 'تخطي الجزء' }));
    expect(mic.open).toBe(0);
    expect(screen.getByRole('heading', { name: /السيرينة/ })).toBeTruthy();
  });

  it('the siren timer ends by itself', async () => {
    const { user } = renderApp('warmup');
    await user.click(nav().getByRole('button', { name: 'تخطي الجزء' }));
    await user.click(button('ابدئي'));
    await sing(57, 61000);
    expect(screen.queryByRole('button', { name: '⏹ كفاية' })).toBeNull();
    expect(mic.open).toBe(0);
  });

  it('leaving mid-hum and coming back starts clean', async () => {
    const { user } = renderApp('warmup');
    await user.click(nav().getByRole('button', { name: 'تخطي الجزء' }));
    await user.click(nav().getByRole('button', { name: 'تخطي الجزء' }));
    await user.click(button('ابدئي'));
    await tick(500);
    await leaveApp();
    expect(mic.open).toBe(0);
    await returnToApp();
    expect(screen.getByRole('heading', { name: /ترعيش الشفايف/ })).toBeTruthy();
  });
});
