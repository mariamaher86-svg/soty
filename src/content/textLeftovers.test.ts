// Every user-facing string, as it's shown (after the no-emoji pass), must read cleanly: no empty brackets or quote
// marks left behind by a removed emoji or label, no double spaces, no space before punctuation.
import { describe, expect, it } from 'vitest';
import { plainText } from '../lib/plainText';
import { toMasc } from '../lib/gender';

const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ARABIC = /[؀-ۿ]/;

/** Arabic string literals and JSX text runs (code comments taken out first). */
function userStrings(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const [file, raw] of Object.entries(files)) {
    // the service worker's generated source isn't text she reads
    if (file.includes('.test.') || file.includes('/test/') || file.endsWith('/lib/precache.ts')) continue;
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      const t = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, 'X');
      if (ARABIC.test(t)) out.push({ file, text: t });
    }
    for (const m of src.matchAll(/>([^<>{}]*[؀-ۿ][^<>{}]*)</g)) out.push({ file, text: m[1].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

const PROBLEMS: [string, RegExp][] = [
  ['empty brackets', /\(\s*\)|\[\s*\]/],
  ['empty quote marks', /«\s*»|“\s*”|"\s*"(?!\w)/],
  ['double space', /\S {2,}\S/],
  ['space before punctuation', /[؀-ۿ\w] [،؛؟!:.](?=\s|$)/],
];

describe('text leftovers', () => {
  it('no emoji alone inside brackets or quote marks in the source (it would leave them empty on screen)', () => {
    const bad = userStrings().filter(({ text }) => /[(«"“]\s*\p{Extended_Pictographic}️?\s*[)»"”]/u.test(text));
    expect(bad.map((b) => `${b.file}: ${b.text.slice(0, 80)}`)).toEqual([]);
  });

  const strings = userStrings();

  it('finds the strings it checks', () => {
    expect(strings.length).toBeGreaterThan(1000);
  });

  for (const [what, re] of PROBLEMS)
    it(`no ${what} in what she reads (girl and boy wording)`, () => {
      const bad = new Set<string>();
      for (const { file, text } of strings)
        for (const shown of [plainText(text), plainText(toMasc(text))]) {
          // a multi-line example (chords lined up over lyrics) keeps its spaces on purpose
          if (what === 'double space' && text.includes(String.fromCharCode(92) + 'n')) continue;
          if (re.test(shown)) bad.add(`${file.replace('/src/', '')}: ${shown.slice(0, 90)}`);
        }
      expect([...bad]).toEqual([]);
    });
});
