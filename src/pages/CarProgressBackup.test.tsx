// Car mode, the progress page, and backup export / import (replace, merge, wrong file).
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { button, go, leaveApp, renderApp, returnToApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { speech } from '../test/fakeSpeech';
import { addResult, getResults, getSongs, saveSongs } from '../lib/storage';
import { browser } from '../lib/reload';
import { normalizeSong } from '../lib/songs';
import { listSongFiles, saveSongFile } from '../audio/songFiles';
import { listTeacher, saveTeacher } from '../audio/teacherStore';

describe('car mode', () => {
  it('▶️ speaks the steps and plays the notes, ⏸ pauses, ▶️ continues where it stopped', async () => {
    const { user } = renderApp('car');
    await user.click(button('10 دقيقة'));
    await user.click(button('ابدئي'));
    await tick(8000);
    expect(speech.spoken.length).toBeGreaterThan(0);
    await user.click(button('إيقاف مؤقت'));
    const spoken = speech.spoken.length;
    const tones = audioControl.tones.length;
    expect(speech.cancelled).toBeGreaterThan(0);
    await tick(20000);
    expect(speech.spoken.length).toBe(spoken);
    expect(audioControl.tones.length).toBe(tones);
    await user.click(button('ابدئي'));
    await tick(30000);
    expect(speech.spoken.length + audioControl.tones.length).toBeGreaterThan(spoken + tones);
  });

  it('a whole 10-minute session runs to the end', async () => {
    const { user } = renderApp('car');
    await user.click(button('10 دقيقة'));
    await user.click(button('ابدئي'));
    for (let i = 0; i < 80 && !screen.queryByText(/برافو! خلصنا/); i++) await tick(15000);
    expect(screen.getByText(/برافو! خلصنا/)).toBeTruthy();
  });

  it('without an Arabic voice: two beeps and the line written on screen', async () => {
    speech.arabic = false;
    const { user } = renderApp('car');
    await user.click(button('ابدئي'));
    await tick(3000);
    expect(screen.getByText(/مفيهوش صوت عربي/)).toBeTruthy();
    expect(audioControl.tones).toContain(880);
  });

  it('leaving the app stops the session; it starts fresh on return', async () => {
    const { user } = renderApp('car');
    await user.click(button('ابدئي'));
    await tick(2000);
    await leaveApp();
    await returnToApp();
    expect(screen.getByText(/اضغطي الزرار الكبير عشان تبدئي/)).toBeTruthy();
  });
});

describe('progress', () => {
  it('shows the best of each day per exercise, and clearing asks first', async () => {
    addResult('match', 60, '3/5');
    addResult('match', 80, '4/5');
    addResult('sustain', 7.5);
    const { user } = renderApp('progress');
    expect(screen.getByRole('heading', { name: 'مطابقة النغمة' })).toBeTruthy();
    expect(document.querySelector('.chart-value')!.textContent).toBe('80');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await user.click(button('مسح كل النتايج'));
    expect(getResults()).toHaveLength(3);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await user.click(button('مسح كل النتايج'));
    expect(getResults()).toHaveLength(0);
    expect(screen.getByText(/لسه مفيش نتايج/)).toBeTruthy();
  });
});

describe('backup', () => {
  /** Export, catching the file the app hands to the download link. */
  async function exportBackup(user: ReturnType<typeof renderApp>['user'], withAudio = true): Promise<File> {
    let file: File | null = null;
    const spy = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      file = b as File;
      return 'blob:x';
    });
    if (!withAudio) await user.click(button(/بدون ملفات الصوت/));
    await user.click(button(/صدّري بياناتك/));
    await tick(50);
    spy.mockRestore();
    return file!;
  }

  async function seed() {
    addResult('match', 70, '7/10');
    const s = normalizeSong({ title: 'أغنية في النسخة' });
    await saveSongFile({ songId: s.id, name: 'a.mp3', type: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3]).buffer });
    s.file = { name: 'a.mp3', type: 'audio/mpeg', size: 3 };
    saveSongs([s]);
    await saveTeacher({ freq: 220, sampleRate: 8000, data: new Float32Array(80), createdAt: 1000, target: 57 });
  }

  it('export → wipe → import "replace" brings everything back, songs files and recordings too', async () => {
    await seed();
    const { user } = renderApp('more');
    await tick(50);
    const file = await exportBackup(user);
    expect(screen.getByText(/اتحفظ الملف/)).toBeTruthy();
    localStorage.clear();
    await (await import('../audio/teacherStore')).clearTeacher();
    await user.upload(screen.getByLabelText(/استرجعي بياناتك/), file);
    await tick(50);
    expect(screen.getByRole('alertdialog').textContent).toMatch(/1 نتيجة، 1 أغنية \(1 ملف صوت\)، و1 تسجيل/);
    await user.click(button('استبدلي'));
    await tick(100);
    expect(getResults()).toHaveLength(1);
    expect(getSongs()[0].title).toBe('أغنية في النسخة');
    expect((await listSongFiles())[0].name).toBe('a.mp3');
    expect(await listTeacher()).toHaveLength(1);
    expect(browser.reload).toHaveBeenCalled();
  });

  it('"ادمجي" keeps what is on this device and adds what is in the file', async () => {
    await seed();
    const { user } = renderApp('more');
    await tick(50);
    const file = await exportBackup(user, false);
    addResult('sustain', 9); // newer, only on this device
    await user.upload(screen.getByLabelText(/استرجعي بياناتك/), file);
    await tick(50);
    await user.click(button('ادمجي'));
    await tick(100);
    expect(getResults().map((r) => r.type).sort()).toEqual(['match', 'sustain']);
  });

  it('a file that is not a backup is refused, and cancel leaves everything as it was', async () => {
    const { user } = renderApp('more');
    await user.upload(screen.getByLabelText(/استرجعي بياناتك/), new File(['not json'], 'x.json', { type: 'application/json' }));
    await tick(20);
    expect(screen.getByText(/مش نسخة احتياطية سليمة/)).toBeTruthy();
    await user.upload(screen.getByLabelText(/استرجعي بياناتك/), new File([JSON.stringify({ app: 'other' })], 'y.json', { type: 'application/json' }));
    await tick(20);
    expect(document.querySelector('.error')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('"عرض الترحيب تاني" brings the welcome back', async () => {
    const { user } = renderApp('more');
    await user.click(button(/عرض الترحيب تاني/));
    expect(browser.reload).toHaveBeenCalled();
    await go('');
  });
});
