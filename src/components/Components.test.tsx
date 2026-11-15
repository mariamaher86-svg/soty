// Small shared pieces: song sharing, the room-noise check, the sound picker, the "before you start" card,
// the weekly lines on the progress page, and the video links.
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { button, inOptions, renderApp, silence, tick } from '../test/app';
import { mic } from '../test/fakeMic';
import { audioControl } from '../test/fakeAudio';
import { getPref, getSongs, saveSongs, updatePath } from '../lib/storage';
import { normalizeSong } from '../lib/songs';
import { listSongFiles, saveSongFile } from '../audio/songFiles';
import { playGlide } from './Demo';

describe('song sharing', () => {
  async function exported(user: ReturnType<typeof renderApp>['user']): Promise<File> {
    let file: File | null = null;
    const spy = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      file = b as File;
      return 'blob:x';
    });
    await inOptions(user, async () => {
      await user.click(screen.getAllByRole('button').find((b) => /صدّري/.test(b.textContent!))!);
      await tick(50);
    });
    spy.mockRestore();
    return file!;
  }

  it('a song exported with its file comes back on another device, file included', async () => {
    const s = normalizeSong({ title: 'أغنية مبعوتة', tags: ['ترانيم'] });
    await saveSongFile({ songId: s.id, name: 'a.mp3', type: 'audio/mpeg', bytes: new Uint8Array([5, 6, 7]).buffer });
    s.file = { name: 'a.mp3', type: 'audio/mpeg', size: 3 };
    saveSongs([s]);
    const { user, unmount } = renderApp(`songs/${s.id}`);
    const file = await exported(user);
    unmount();
    // "another device"
    localStorage.clear();
    await new Promise<void>((r) => {
      const q = indexedDB.deleteDatabase('soty');
      q.onsuccess = q.onerror = q.onblocked = () => r();
    });
    const again = renderApp('songs');
    await again.user.upload(screen.getByLabelText(/ملف|استوردي/, { selector: 'input' }), file);
    await tick(100);
    expect(screen.getByText(/✔ اتضافت: أغنية مبعوتة/)).toBeTruthy();
    expect(getSongs()[0].title).toBe('أغنية مبعوتة');
    expect((await listSongFiles())[0].bytes.byteLength).toBe(3);
  });

  it('importing a song that already exists asks: keep both, or replace', async () => {
    const s = normalizeSong({ title: 'موجودة' });
    saveSongs([s]);
    const { user } = renderApp(`songs/${s.id}`);
    const file = await exported(user);
    await user.click(screen.getAllByRole('link').find((a) => a.getAttribute('href') === '#/songs') ?? document.querySelector('a.back')!);
    await tick(20);
    await user.upload(screen.getByLabelText(/ملف|استوردي/, { selector: 'input' }), file);
    await tick(50);
    expect(screen.getByRole('alertdialog', { name: 'الأغنية موجودة' })).toBeTruthy();
    await user.click(button('احتفظي بالاتنين'));
    await tick(50);
    expect(getSongs()).toHaveLength(2);
  });

  it('a file that is not a song is refused', async () => {
    const { user } = renderApp('songs');
    await user.upload(screen.getByLabelText(/ملف|استوردي/, { selector: 'input' }), new File(['nope'], 'x.json', { type: 'application/json' }));
    await tick(20);
    expect(screen.getByText('الملف ده مش ملف أغنية من صوتي.')).toBeTruthy();
  });
});

describe('room-noise check', () => {
  it('3 quiet seconds: "المكان هادي", and it remembers the room level', async () => {
    const { user } = renderApp('match');
    await user.click(button('خيارات'));
    await user.click(button(/فحص دوشة المكان/));
    mic.level = 0.001;
    mic.noise = true;
    await tick(3200);
    expect(screen.getByText(/المكان هادي|المكان كويس/)).toBeTruthy();
    expect(getPref('noise.rms')).not.toBeNull();
    expect(mic.open).toBe(0);
  });

  it('a noisy room warns, can be dismissed, and can be turned off', async () => {
    const { user } = renderApp('match');
    await user.click(button('خيارات'));
    await user.click(button(/فحص دوشة المكان/));
    mic.level = 0.2;
    mic.noise = true;
    await tick(3200);
    expect(screen.getByText(/المكان دوشة شوية/)).toBeTruthy();
    await user.click(button('متفحصيش تاني'));
    expect(screen.queryByRole('button', { name: /فحص دوشة المكان/ })).toBeNull();
    expect(getPref('noise.check')).toBe('off');
    await silence(10);
  });
});

describe('sound picker and tips', () => {
  it('the chosen sound is remembered; the voice falls back to the choir', async () => {
    const { user } = renderApp('match');
    await user.click(button('خيارات'));
    await user.click(screen.getAllByRole('button', { name: /صوت \(كورال\)/ })[0]);
    expect(getPref('sound')).toBe('voice');
    await user.click(screen.getAllByRole('button', { name: /بيانو/ })[0]);
    expect(getPref('sound')).toBe('piano');
  });

  it('"قبل ما تبدأي" opens and hides', async () => {
    const { user } = renderApp('match');
    await user.click(button('خيارات'));
    const open = screen.queryByRole('button', { name: /قبل ما تبدأي/ });
    if (open) await user.click(open);
    await user.click(button('إخفاء النصايح'));
    expect(button(/قبل ما تبدأي/)).toBeTruthy();
  });
});

describe('weekly lines and video links', () => {
  it('the progress page draws each measure from the start to this week', () => {
    updatePath((p) => {
      p.baseline = { date: '2026-11-01', rangeLow: 50, rangeHigh: 70, matchCents: 40, matchLockSec: 3, sustainSec: 5, stabilityCents: 15, hissSec: 8 };
      p.weekly = [{ date: '2026-11-08', rangeLow: 48, rangeHigh: 72, matchCents: 25, matchLockSec: 2, sustainSec: 8, stabilityCents: 10, hissSec: 12 }];
    });
    renderApp('progress');
    expect(screen.getByText(/القياسات الأسبوعية/)).toBeTruthy();
    expect(document.querySelectorAll('.line-chart').length).toBeGreaterThan(3);
  });

  it('video links open a YouTube search in Arabic and English, in a new tab', () => {
    renderApp('breath');
    const links = [...document.querySelectorAll('a.tool-chip')] as HTMLAnchorElement[];
    expect(links.length).toBeGreaterThan(1);
    for (const a of links) {
      expect(a.href).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
      expect(a.target).toBe('_blank');
      expect(a.rel).toMatch(/noopener/);
    }
  });

  it('the siren example glides and always settles', async () => {
    renderApp('');
    let done = false;
    void playGlide(55, 67, 2).then(() => (done = true));
    await tick(3000);
    expect(done).toBe(true);
    expect(audioControl.started.length).toBeGreaterThan(0);
  });
});
