import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { button, go, renderApp, sing, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { getLessonProgress, getLessonsDone, markLessonDone } from '../lib/storage';
import { lessonById } from '../content/lessons';

const lessonPanel = () => within(document.querySelector('.lesson') as HTMLElement);

/** Answer the quiz on screen: right (by reading the answer from the pool) or wrong on purpose. */
async function takeQuiz(user: ReturnType<typeof renderApp>['user'], id: string, wrong = 0): Promise<string[]> {
  const pool = lessonById(id)!.pool;
  const asked: string[] = [];
  for (let i = 0; i < 10; i++) {
    const q = document.querySelector('.lesson h2')!.textContent!;
    asked.push(q);
    const item = pool.find((p) => p.q === q)!;
    const right = item.options[item.answer];
    const pick = i < wrong ? [...document.querySelectorAll('.answers button')].find((b) => b.textContent !== right)! : [...document.querySelectorAll('.answers button')].find((b) => b.textContent === right)!;
    await user.click(pick as HTMLElement);
    expect(document.querySelector('.lesson-why')).toBeTruthy(); // the explanation after each answer
    await user.click(button(i < 9 ? /السؤال اللي بعده/ : /النتيجة/));
  }
  return asked;
}

describe('lessons', () => {
  it('list → contents → sections with "next" marking each read → summary → quiz pass → ✔', async () => {
    const { user } = renderApp('lessons');
    await user.click(screen.getByRole('link', { name: /يعني إيه نغمة/ }));
    await tick(20);
    await user.click(button('ابدئي الدرس ←'));
    const n = lessonById('note')!.sections.length;
    for (let i = 0; i < n; i++) {
      expect(screen.getByText(`${i + 1} من ${n}`)).toBeTruthy();
      await user.click(lessonPanel().getByRole('button', { name: 'التالي ←' }));
    }
    expect(screen.getByText('الخلاصة')).toBeTruthy();
    expect(getLessonProgress().note.read).toHaveLength(n);
    await user.click(button('يلا الاختبار ←'));
    await takeQuiz(user, 'note');
    expect(screen.getByText(/برافو! الدرس خلص/)).toBeTruthy();
    expect(getLessonsDone().note).toBeTruthy();
    await go('lessons');
    expect(screen.getByRole('link', { name: /يعني إيه نغمة/ }).textContent).toMatch(/✔/);
  });

  it('7 of 10 fails; "نجرب الاختبار تاني" gives a different set of questions', async () => {
    const { user } = renderApp('lessons/rhythm');
    await user.click(button('يلا الاختبار ←'));
    const firstSet = await takeQuiz(user, 'rhythm', 3);
    expect(screen.getByText(/محتاجين 8 على الأقل/)).toBeTruthy();
    expect(getLessonsDone().rhythm).toBeUndefined();
    await user.click(button('نجرب الاختبار تاني'));
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      seen.add(document.querySelector('.lesson h2')!.textContent!);
      await user.click(document.querySelector('.answers button') as HTMLElement);
      await user.click(button(i < 9 ? /السؤال اللي بعده/ : /النتيجة/));
    }
    expect(seen.size).toBe(10);
    expect([...seen]).not.toEqual(firstSet);
  });

  it('a lesson already passed stays passed after a failed retake', async () => {
    markLessonDone('cents');
    const { user } = renderApp('lessons/cents');
    await user.click(button('يلا الاختبار ←'));
    await takeQuiz(user, 'cents', 10);
    expect(getLessonsDone().cents).toBeTruthy();
  });

  it('"ارجعي لآخر مكان" opens the section she was on, from the list and from the contents', async () => {
    const { user } = renderApp('lessons/scale');
    await user.click(button('ابدئي الدرس ←'));
    await user.click(lessonPanel().getByRole('button', { name: 'التالي ←' }));
    await user.click(lessonPanel().getByRole('button', { name: 'التالي ←' }));
    await go('lessons');
    await user.click(screen.getByRole('link', { name: /ارجعي لآخر مكان/ }));
    await tick(20);
    expect(screen.getByText(`3 من ${lessonById('scale')!.sections.length}`)).toBeTruthy();
    await go('lessons/scale');
    await user.click(button('ارجعي لآخر مكان ←'));
    expect(screen.getByText(`3 من ${lessonById('scale')!.sections.length}`)).toBeTruthy();
    const toc = await (async () => {
      await user.click(lessonPanel().getByRole('button', { name: '→ رجوع' }));
      await user.click(lessonPanel().getByRole('button', { name: '→ رجوع' }));
      await user.click(lessonPanel().getByRole('button', { name: '→ الفهرس' }));
      return [...document.querySelectorAll('.lesson-toc .toc-mark')].map((m) => m.textContent);
    })();
    expect(toc.slice(0, 2)).toEqual(['✔', '✔']);
  });

  it('listen buttons play the example in her octave and light the keys', async () => {
    const { user } = renderApp('lessons/scale');
    await user.click(button('ابدئي الدرس ←'));
    await user.click(screen.getAllByRole('button', { name: /اسمعي: سلم دو ماجير/ })[0]);
    await tick(200);
    expect(document.querySelectorAll('.piano-dock.inline .pkey.same').length).toBe(8);
    await tick(6000);
    expect(audioControl.tones.length).toBe(8);
  });

  it('a glossary word opens its meaning; the glossary page finds words', async () => {
    const { user } = renderApp('lessons/note');
    await user.click(button('ابدئي الدرس ←'));
    await user.click(document.querySelector('.term-link') as HTMLElement);
    expect(screen.getByRole('dialog').textContent).toMatch(/hertz/);
    await user.click(button('تمام'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await go('lessons/glossary');
    await user.type(screen.getByRole('searchbox'), 'maqam');
    expect(document.querySelectorAll('.glossary dt')).toHaveLength(1);
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(screen.getByText('مفيش كلمة زي دي.')).toBeTruthy();
  });

  it('all summaries are on one page', async () => {
    renderApp('lessons/summaries');
    expect(document.querySelectorAll('.lesson-summary')).toHaveLength(14);
  });

  it('"جربي بصوتك": sing the note, hold it, bravo; stopping releases the mic', async () => {
    const { user } = renderApp('lessons/note');
    const toc = [...document.querySelectorAll('.lesson-toc button')] as HTMLElement[];
    await user.click(toc[3]);
    await user.click(button('🎤 ابدئي'));
    await tick(1100);
    mic.freq = audioControl.tones.at(-1)!;
    await tick(1500);
    expect(screen.getByText(/برافو/)).toBeTruthy();
    await user.click(button('⏹ وقفي'));
    expect(mic.open).toBe(0);
  });

  it('a voice try with three notes moves note by note', async () => {
    const { user } = renderApp('lessons/solfege');
    const toc = [...document.querySelectorAll('.lesson-toc button')] as HTMLElement[];
    await user.click(toc[toc.length - 1]);
    await user.click(button('🎤 ابدئي'));
    for (let k = 0; k < 3; k++) {
      await tick(1100);
      expect(screen.getByText(`نغمة ${k + 1} من 3`)).toBeTruthy();
      mic.freq = audioControl.tones.at(-1)!;
      await tick(1400);
    }
    expect(screen.getByText(/برافو/)).toBeTruthy();
    await sing(60, 100);
  });
});
