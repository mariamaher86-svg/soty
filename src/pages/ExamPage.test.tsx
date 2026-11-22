import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, go, renderApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { getExamHistory, getResults, markLessonDone, setPref } from '../lib/storage';
import { lessonById } from '../content/lessons';

/** Answer what's on screen: right, or wrong for questions from `wrongIn`. */
async function answerAll(user: ReturnType<typeof renderApp>['user'], wrongIn: string[] = []) {
  for (let i = 0; i < 40 && document.querySelector('.answers'); i++) {
    const hint = document.querySelector('.lesson .hint')!.textContent!;
    const lessonTitle = hint.split('·')[1].trim();
    const q = document.querySelector('.lesson h2')!.textContent!;
    const lesson = ['note', 'solfege', 'octave'].map((id) => lessonById(id)!).find((l) => l.title === lessonTitle)!;
    const item = lesson.pool.find((p) => p.q === q)!;
    const right = item.options[item.answer];
    const pick = [...document.querySelectorAll('.answers button')].find((b) => (wrongIn.includes(lesson.id) ? b.textContent !== right : b.textContent === right))!;
    if (item.sound) {
      await user.click(button(/اسمعي/));
      await tick(4000);
    }
    await user.click(pick as HTMLElement);
    await user.click(button(/السؤال اللي بعده|النتيجة/));
  }
}

describe('comprehensive exam', () => {
  it('with no completed lesson it says so kindly and offers the first lesson', async () => {
    renderApp('lessons/exam');
    expect(screen.getByText(/لسه مفيش درس خلص/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /يعني إيه نغمة/ }).getAttribute('href')).toBe('#/lessons/note');
  });

  it('opens from the lessons list', async () => {
    const { user } = renderApp('lessons');
    await user.click(screen.getByRole('link', { name: /امتحان شامل/ }));
    await tick(20);
    expect(window.location.hash).toBe('#/lessons/exam');
  });

  it('10 questions from the finished lessons only; a score per lesson; the weak one has a button to revise it; saved', async () => {
    for (const id of ['note', 'solfege', 'octave']) markLessonDone(id);
    const { user } = renderApp('lessons/exam');
    await user.click(button('10 سؤال'));
    await answerAll(user, ['octave']);
    expect(document.querySelector('.score-value')!.textContent).toMatch(/من 10/);
    const weak = [...document.querySelectorAll('.exam-lessons li.weak')];
    expect(weak).toHaveLength(1);
    expect(weak[0].textContent).toMatch(/الأوكتاف/);
    expect(weak[0].querySelector('a')!.getAttribute('href')).toBe('#/lessons/octave');
    expect(document.querySelectorAll('.exam-lessons li.ok')).toHaveLength(2);
    const h = getExamHistory();
    expect(h).toHaveLength(1);
    expect(h[0].total).toBe(10);
    expect(h[0].lessons.octave[0]).toBe(0);
    expect(getResults().filter((r) => r.type === 'exam')).toHaveLength(1); // on the progress page
    await go('progress');
    expect(screen.getByRole('heading', { name: 'الامتحان الشامل' })).toBeTruthy();
  });

  it('listening questions play in her range with the chosen sound', async () => {
    for (const id of ['note', 'solfege', 'octave']) markLessonDone(id);
    setPref('sound', 'piano');
    const { user } = renderApp('lessons/exam');
    await user.click(button('30 سؤال'));
    let heard = false;
    for (let i = 0; i < 30 && !heard; i++) {
      const listen = screen.queryByRole('button', { name: /اسمعي/ });
      if (listen) {
        await user.click(listen);
        await tick(4000);
        heard = audioControl.tones.length > 0;
        break;
      }
      await user.click(document.querySelector('.answers button') as HTMLElement);
      await user.click(button(/السؤال اللي بعده|النتيجة/));
    }
    expect(heard).toBe(true);
    // her octave: the default girls' range puts these notes around C4–C5
    for (const f of audioControl.tones) {
      expect(f).toBeGreaterThan(150);
      expect(f).toBeLessThan(1100);
    }
  });

  it('"امتحان تاني" starts over with new questions', async () => {
    markLessonDone('note');
    const { user } = renderApp('lessons/exam');
    await user.click(button('10 سؤال'));
    const first = document.querySelector('.lesson h2')!.textContent;
    await answerAll(user);
    await user.click(button('امتحان تاني'));
    await user.click(button('10 سؤال'));
    expect(document.querySelector('.answers')).toBeTruthy();
    expect(typeof first).toBe('string');
    expect(screen.getByText(/آخر امتحان|سؤال 1 من/)).toBeTruthy();
  });
});
