// Screens that explain themselves: the meter in words, the piano vocalise (one pattern, numbered note names, a start
// note that fits her range), the game's start overlay, and the first-time bubbles on every exercise.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { button, renderApp, tick } from '../test/app';
import { CentsMeter, meterWord } from './ui';
import { fitFor } from './PianoVocalise';
import { fitsRange, fitStart, patternSteps, patternTop } from '../lib/pianoVocalise';
import { getPref, saveRange } from '../lib/storage';
import { comfortableRange } from '../lib/voice';
import { noteName } from '../lib/music';
import { WALKS } from '../content/walkthrough';

// all app source as text (for the quoted button labels in the bubbles)
const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const UI = Object.entries(files)
  .filter(([path]) => !path.includes('/content/walkthrough') && !path.includes('/content/help') && !/\.test\.tsx?$/.test(path))
  .map(([, t]) => t)
  .join(' ');

describe('the meter says what to do', () => {
  it('in tune / go up / go down / nothing yet, in words, no ♭ or ♯', () => {
    expect(meterWord(5).ar).toBe('مظبوط ✔');
    expect(meterWord(-40).ar).toBe('اطلعي شوية ⬆'); // flat: go up
    expect(meterWord(40).ar).toBe('انزلي شوية ⬇'); // sharp: go down
    expect(meterWord(null).ar).toBe('غني…');
    expect(meterWord(30, 50).kind).toBe('ok');
  });

  it('"صوتك" is written on the moving line, and the word changes with her voice', () => {
    const { rerender, container } = render(<CentsMeter cents={-45} />);
    expect(container.querySelector('.meter-needle .meter-you')!.textContent).toBe('صوتك');
    expect(container.querySelector('.meter-word')!.textContent).toBe('اطلعي شوية ⬆');
    rerender(<CentsMeter cents={3} />);
    expect(container.querySelector('.meter-word')!.textContent).toBe('مظبوط ✔');
    expect(container.textContent).not.toMatch(/[♭♯#]/);
  });
});

describe('piano vocalise: chosen for her', () => {
  it('the start note keeps the whole pattern in her comfortable range (centred when the range is narrower)', () => {
    expect(fitStart(55, 72, 7)).toBe(55);
    expect(fitStart(60, 65, 7)).toBe(59); // a 5-semitone range can't hold 7: centred
    for (const [low, high] of [
      [55, 74],
      [48, 67],
      [60, 79],
    ])
      for (const id of ['five', 'arp', 'octave', 'nee', 'staccato']) {
        const src = { kind: 'vocalise' as const, id };
        const start = fitFor(src, { low, high });
        expect(fitsRange(start, patternTop(patternSteps(src, start), start), low, high), `${id} ${low}-${high}`).toBe(true);
      }
  });

  it('one recommended pattern with one line about it; the others behind «غيّري التمرين»; numbered note names; no warning', async () => {
    saveRange({ low: 52, high: 76, voiceType: 'mezzo', date: '2026-11-01' });
    const { user } = renderApp('piano');
    await user.click(button(/🎶 فوكاليز/));
    expect(screen.getByText('سلم الخمس نغمات "آه"')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'أربيجيو "ما مي ما"' })).toBeNull();
    expect(screen.getByText(/قولي «آه» على كل نغمة/)).toBeTruthy();
    const notes = [...document.querySelectorAll('.pv-notes li')].map((li) => li.textContent);
    expect(notes).toHaveLength(9);
    expect(notes[0]).toMatch(/^١ /);
    expect(document.querySelector('.pv-dots')).toBeNull();
    // the start fits her comfortable range: no warning
    const c = comfortableRange(52, 76);
    expect(screen.getByText(/اخترناها على قد صوتك/).textContent).toContain(noteName(fitFor({ kind: 'vocalise', id: 'five' }, c)));
    expect(document.querySelector('.pv-outside')).toBeNull();
    expect(button('🎤 دورك')).toBeTruthy();
    await user.click(button('غيّري التمرين'));
    expect(button('أربيجيو "ما مي ما"')).toBeTruthy();
  });

  it('only when she picks a start that does not fit: one short, gentle line', async () => {
    saveRange({ low: 52, high: 76, voiceType: 'mezzo', date: '2026-11-01' });
    const { user } = renderApp('piano');
    await user.click(button(/🎶 فوكاليز/));
    const top = document.querySelectorAll('.pkey');
    await user.click(top[top.length - 1] as HTMLElement); // the highest key on the keyboard
    expect(document.querySelector('.pv-outside')!.textContent).toMatch(/برا المنطقة المريحة/);
  });
});

describe('the voice game starts with a clear screen', () => {
  it('the bird, one line, one big «ابدئي»; no best score until there is one; easy/medium/hard', async () => {
    const { user } = renderApp('game');
    const start = document.querySelector('.game-start')!;
    expect(start.querySelector('.game-bird')).toBeTruthy();
    expect(start.textContent).toMatch(/صوتك العالي يطلّع العصفورة، والواطي ينزّلها\. عدّيها من الفتحات\./);
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByText(/أحسن نتيجة/)).toBeNull();
    expect(['سهل', 'متوسط', 'صعب'].map((n) => !!screen.queryByRole('button', { name: n }))).toEqual([true, true, true]);
    await user.click(button('ابدئي'));
    await tick(100);
    expect(document.querySelector('.game-start')).toBeNull();
  });
});

describe('"أول مرة هنا؟" bubbles', () => {
  it('every «quoted» button label in them exists in the app', () => {
    const missing: string[] = [];
    for (const [id, steps] of Object.entries(WALKS)) for (const t of steps!) for (const m of t.matchAll(/«([^»]+)»/g)) if (!UI.includes(m[1])) missing.push(`${id}: «${m[1]}»`);
    expect(missing).toEqual([]);
  });

  it('2–3 bubbles per screen, each a short sentence', () => {
    for (const steps of Object.values(WALKS)) {
      expect(steps!.length).toBeGreaterThanOrEqual(2);
      expect(steps!.length).toBeLessThanOrEqual(3);
      for (const t of steps!) expect(t.length).toBeLessThan(110);
    }
  });

  it('shown the first time, one at a time; once done they stay away; ❓ shows them again', async () => {
    const { user, unmount } = renderApp('match');
    const walk = () => document.querySelector('.walk');
    expect(walk()!.textContent).toMatch(/أول مرة هنا؟ ١ من ٣/);
    await user.click(button('الجاية ←'));
    expect(walk()!.textContent).toMatch(/صوتك: خليه جوه الأخضر/);
    await user.click(button('الجاية ←'));
    await user.click(button('فهمت ✔'));
    expect(walk()).toBeNull();
    expect(getPref('walk.match')).toBe('1');
    unmount();
    const again = renderApp('match');
    expect(walk()).toBeNull();
    await again.user.click(document.querySelector('main .help-toggle') as HTMLElement);
    await again.user.click(button('🔁 وريني الشرح السريع تاني'));
    expect(walk()!.textContent).toMatch(/١ من ٣/);
  });

  it('there is always a big start button before an exercise starts', () => {
    for (const [route, label] of [
      ['match', 'ابدئي'],
      ['vocalise', '▶️ ابدئي'],
      ['dynamics', '🎤 ابدئي'],
      ['game', 'ابدئي'],
    ] as const) {
      const r = renderApp(route);
      expect(button(label).className, route).toMatch(/big/);
      r.unmount();
    }
  });
});
