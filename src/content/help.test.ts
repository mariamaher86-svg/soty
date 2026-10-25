// Keeps the help notes in sync with the UI: every «quoted» button label must exist in the app's source.

import { describe, expect, it } from 'vitest';
import { GUIDE_ORDER, HELP, quotedLabels, type HelpKey } from './help';

// all app source files as text (through Vite), except the help file and tests themselves
const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const UI = Object.entries(files)
  .filter(([path]) => !path.includes('/content/help') && !path.endsWith('.test.ts'))
  .map(([, text]) => text)
  .join(' ');

describe('help notes', () => {
  it('every quoted label exists in the UI source', () => {
    const missing: string[] = [];
    for (const [key, e] of Object.entries(HELP)) for (const label of quotedLabels(e)) if (!UI.includes(label)) missing.push(`${key}: «${label}»`);
    expect(missing).toEqual([]);
  });

  it('every entry has the full structure', () => {
    for (const e of Object.values(HELP)) {
      expect(e.what.length).toBeGreaterThan(10);
      expect(e.why.length).toBeGreaterThan(10);
      expect(e.steps.length).toBeGreaterThanOrEqual(2);
      expect(e.steps.length).toBeLessThanOrEqual(5);
      expect(e.numbers.length).toBeGreaterThanOrEqual(1);
      expect(e.tips.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('the guide lists every feature once, starting with the beginner path', () => {
    expect([...GUIDE_ORDER].sort()).toEqual((Object.keys(HELP) as HelpKey[]).sort());
    expect(GUIDE_ORDER[0]).toBe('path');
  });

  it('every feature page shows its help (help="key" on the page or <Help id="key" />)', () => {
    const unused = Object.keys(HELP).filter((key) => !UI.includes(`help="${key}"`) && !UI.includes(`id="${key}"`));
    expect(unused).toEqual([]);
  });
});
