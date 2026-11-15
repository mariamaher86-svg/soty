// Detect the maqam (KeyPage) and the teacher's recordings (TeacherPage, with the pitch check).
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, renderApp, sing, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { mic } from '../test/fakeMic';
import { midiToFreq } from '../lib/music';
import { listTeacher } from '../audio/teacherStore';

describe('detect the maqam', () => {
  it('a G major melody is detected as G major, and its scale can be heard', async () => {
    const { user } = renderApp('key');
    await user.click(screen.getAllByRole('button', { name: /اسمعي|ابدئي|🎤/ }).find((b) => b.className.includes('primary'))!);
    const melody = [55, 57, 59, 60, 62, 64, 66, 67, 66, 64, 62, 59, 55, 55];
    for (let k = 0; k < 3; k++) for (const m of melody) await sing(m, 400);
    await user.click(screen.getAllByRole('button').find((b) => b.className.includes('big') && /خلص|كفاية|وقفي/.test(b.textContent!))!);
    const list = document.querySelector('main')!.textContent!;
    expect(list).toMatch(/صول/);
    expect(mic.open).toBe(0);
    await user.click(screen.getAllByRole('button', { name: '🔊 اسمعي السلم' })[0]);
    await tick(6000);
    expect(audioControl.tones.length).toBeGreaterThanOrEqual(7);
  });

  it('too little singing gives no guess yet', async () => {
    const { user } = renderApp('key');
    await user.click(screen.getAllByRole('button', { name: /اسمعي|ابدئي|🎤/ }).find((b) => b.className.includes('primary'))!);
    await sing(60, 1000);
    await user.click(screen.getAllByRole('button').find((b) => b.className.includes('big') && /خلص|كفاية|وقفي/.test(b.textContent!))!);
    expect(screen.queryAllByRole('button', { name: '🔊 اسمعي السلم' })).toHaveLength(0);
  });

  it('the final-note hint: a steady note is taken, a wobbly one is refused', async () => {
    const { user } = renderApp('key');
    await user.click(button(/النغمة اللي الأغنية بتخلص عليها/));
    for (let i = 0; i < 40; i++) await sing(i % 2 ? 60 : 63, 100);
    await tick(500);
    expect(screen.getByText(/مسمعناش نغمة ثابتة/)).toBeTruthy();
    await user.click(button(/النغمة اللي الأغنية بتخلص عليها/));
    await sing(62, 4000);
    expect(screen.queryByText(/مسمعناش نغمة ثابتة/)).toBeNull();
    expect(document.querySelector('main')!.textContent).toMatch(/ري/);
  });
});

describe('teacher recordings', () => {
  it('a steady take on the right note is saved and can be played and re-checked', async () => {
    const { user } = renderApp('teacher');
    const chip = screen.getAllByRole('button').find((b) => b.textContent!.trim() === 'G4')!;
    await user.click(chip);
    audioControl.song = { seconds: 3, freqAt: (t) => (t > 0.3 ? midiToFreq(67) : null) };
    await user.click(screen.getAllByRole('button').find((b) => b.className.includes('big primary'))!);
    await tick(6000);
    const saved = await listTeacher();
    expect(saved).toHaveLength(1);
    expect(Math.abs(1200 * Math.log2(saved[0].freq / midiToFreq(67)))).toBeLessThan(10);
    expect(mic.open).toBe(0);
    await user.click(button('سماع التسجيل'));
    await tick(2000);
    await user.click(button('فحص'));
    await tick(500);
    expect(document.querySelector('.check-line')).toBeTruthy();
  });

  it('a take 60 cents off is refused with a reason, and nothing is saved', async () => {
    const { user } = renderApp('teacher');
    const chip = screen.getAllByRole('button').find((b) => b.textContent!.trim() === 'G4')!;
    await user.click(chip);
    audioControl.song = { seconds: 3, freqAt: () => midiToFreq(67) * Math.pow(2, 60 / 1200) };
    await user.click(screen.getAllByRole('button').find((b) => b.className.includes('big primary'))!);
    await tick(6000);
    expect(await listTeacher()).toHaveLength(0);
    expect(document.querySelector('.error')!.textContent!.length).toBeGreaterThan(5);
  });

  it('a recording that cannot be read says so instead of hanging', async () => {
    const { user } = renderApp('teacher');
    await user.click(screen.getAllByRole('button').find((b) => b.textContent!.trim() === 'G4')!);
    audioControl.decodeFails = true;
    await user.click(screen.getAllByRole('button').find((b) => b.className.includes('big primary'))!);
    await tick(6000);
    expect(screen.getByText(/حصلت مشكلة في قراءة التسجيل/)).toBeTruthy();
    expect(screen.getAllByRole('button').every((b) => !(b as HTMLButtonElement).disabled || b.textContent === '')).toBe(true);
  });
});
