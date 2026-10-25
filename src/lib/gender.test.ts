import { describe, expect, it } from 'vitest';
import { FEM_LEFTOVER, MASC_WORDS, NEUTRAL_LOOKALIKES, toMasc } from './gender';

// every Arabic text run in the app source (strings and JSX text), through Vite
const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const uiText = Object.entries(files)
  .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('/lib/gender.ts'))
  .map(([, t]) => t.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))
  .join(' ');

describe('wording helper', () => {
  it('turns feminine words into masculine ones, whole words only', () => {
    expect(toMasc('ابدئي الاختبار')).toBe('ابدأ الاختبار');
    expect(toMasc('🔊 اسمعيها تاني')).toBe('🔊 اسمعها تاني');
    expect(toMasc('+15 سنت — انزلي شوية')).toBe('+15 سنت — انزل شوية');
    expect(toMasc('حسّيتي بأي وجع؟')).toBe('حسّيت بأي وجع؟');
    expect(toMasc('خدي نفس واثبتي')).toBe('خد نفس واثبت'); // "و" prefix
    expect(toMasc('إنتي ماشية صح')).toBe('إنت ماشية صح'); // adjectives that depend on context are left to g()
    expect(toMasc('أغنية مريحة')).toBe('أغنية مريحة');
  });
  it('is idempotent and never creates feminine words', () => {
    for (const [f, m] of Object.entries(MASC_WORDS)) {
      expect(toMasc(m)).toBe(m);
      expect(toMasc(toMasc(f))).toBe(m);
    }
  });
  it('no known feminine-only form is left in masculine mode (whole UI)', () => {
    const masc = toMasc(uiText);
    const left = new Set<string>();
    for (const f of Object.keys(MASC_WORDS)) if (new RegExp(`(?<![\\u0600-\\u06FF])[وف]?${f}(?![\\u0600-\\u06FF])`).test(masc)) left.add(f);
    for (const m of masc.matchAll(FEM_LEFTOVER)) if (!NEUTRAL_LOOKALIKES.has(m[0])) left.add(m[0]);
    expect([...left].sort()).toEqual([]);
  });
});
