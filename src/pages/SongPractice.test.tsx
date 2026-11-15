// Phrase loop and speed (from the sing-along), phrase-by-phrase learning, and choir parts.
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, go, inOptions, leaveApp, renderApp, returnToApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { media } from '../test/fakeMedia';
import { mic } from '../test/fakeMic';
import { getResults, getSongs, saveSongs, setPref } from '../lib/storage';
import { saveSongFile } from '../audio/songFiles';
import { normalizeSong, type Song } from '../lib/songs';
import { midiToFreq } from '../lib/music';
import { partKey } from '../lib/choir';

/** Two phrases with a rest between: 0–2 s (C, D), 3–5 s (E, F). */
const notesAt = (t: number) => (t < 0 ? null : t < 1 ? 60 : t < 2 ? 62 : t < 3 ? null : t < 4 ? 64 : t < 5 ? 65 : null);
const freqAt = (t: number) => {
  const m = notesAt(t);
  return m === null ? null : midiToFreq(m);
};

async function storedSong(extra: Partial<Song> = {}): Promise<Song> {
  const s = normalizeSong({ title: 'أغنية', ...extra });
  await saveSongFile({ songId: s.id, name: 'song.mp3', type: 'audio/mpeg', bytes: new Uint8Array(4000).buffer });
  s.file = { name: 'song.mp3', type: 'audio/mpeg', size: 4000 };
  saveSongs([...getSongs(), s]);
  return s;
}

/** Sing along with whichever player is playing, exactly on the notes. */
function followPlayer() {
  mic.at = () => {
    const p = [...media.players].reverse().find((x) => !x.paused);
    return { freq: p ? freqAt(p.currentTime) : null };
  };
}

describe('phrase loop and speed', () => {
  it('opened from the sing-along: repeats the phrase N times, scores each, saves the last', async () => {
    audioControl.song = { seconds: 5, freqAt };
    media.duration = 5;
    const s = await storedSong();
    setPref('sing.song', s.id);
    setPref('sing.mode', 'file');
    const { user } = renderApp('sing');
    await tick(3000);
    await user.click(button(/تكرار جملة/));
    await inOptions(user, async () => {
      await user.click(button('3'));
      await user.click(button('75%'));
    });
    followPlayer();
    await user.click(button(/ابدئي التكرار/));
    expect(media.last!.playbackRate).toBe(0.75);
    await tick(40000);
    const r = getResults().filter((x) => x.type === 'loop');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeGreaterThanOrEqual(70);
    expect(r[0].songId).toBe(s.id);
    expect(mic.open).toBe(0);
    expect(button(/كرري تاني/)).toBeTruthy();
  });

  it('the start and end can be nudged, and closing stops the music', async () => {
    audioControl.song = { seconds: 5, freqAt };
    media.duration = 5;
    const s = await storedSong();
    setPref('sing.song', s.id);
    setPref('sing.mode', 'file');
    const { user } = renderApp('sing');
    await tick(3000);
    await user.click(button(/تكرار جملة/));
    await user.click(button('النهاية متأخر نص ثانية'));
    await user.click(button('البداية متأخر نص ثانية'));
    await user.click(button(/ابدئي التكرار/));
    await tick(500);
    const player = media.last!;
    expect(player.paused).toBe(false);
    await go('exercises'); // leaving the page mid-loop
    await tick(3000);
    expect(player.paused).toBe(true);
  });
});

describe('learn a song phrase by phrase', () => {
  it('finds the phrases, plays one, practises it to 70%+, then marks it learned', async () => {
    audioControl.song = { seconds: 5, freqAt };
    media.duration = 5;
    const s = await storedSong();
    const { user } = renderApp(`songs/${s.id}/learn`);
    await tick(3000);
    expect(screen.getAllByRole('button', { name: /جملة \d/ }).length).toBe(2);
    await user.click(button(/النغمات ببطء/));
    await tick(5000);
    expect(audioControl.tones.length).toBeGreaterThanOrEqual(2);
    await user.click(button(/غني الجملة دي/));
    await inOptions(user, () => user.click(button('3')));
    followPlayer();
    await user.click(button(/ابدئي التكرار/));
    await tick(30000);
    expect(screen.getByText(/اتعلمت ✔/)).toBeTruthy();
    expect(screen.getByText(/اتعلمتي 1 من 2 جمل/)).toBeTruthy();
  });

  it('a song without its file on this device says so', async () => {
    const s = normalizeSong({ title: 'من غير ملف' });
    s.file = { name: 'x.mp3', type: 'audio/mpeg', size: 1 };
    saveSongs([s]);
    renderApp(`songs/${s.id}/learn`);
    await tick(200);
    expect(document.querySelector('.error, .hint')!.textContent).toBeTruthy();
    expect(screen.queryByRole('button', { name: /غني الجملة دي/ })).toBeNull();
  });
});

describe('choir parts', () => {
  async function choirSong() {
    const s = await storedSong();
    const parts: { id: string; name: string; file: { name: string; type: string; size: number } }[] = [];
    for (const [i, name] of ['سوبرانو', 'ألتو'].entries()) {
      const id = 'p' + i;
      await saveSongFile({ songId: partKey(s.id, id), name: `${id}.mp3`, type: 'audio/mpeg', bytes: new Uint8Array(1000).buffer });
      parts.push({ id, name, file: { name: `${id}.mp3`, type: 'audio/mpeg', size: 1000 } });
    }
    saveSongs(getSongs().map((x) => (x.id === s.id ? { ...x, parts } : x)));
    return s;
  }

  it('parts are added on the song page and the choir practice opens with both', async () => {
    const s = await storedSong();
    const { user } = renderApp(`songs/${s.id}`);
    await user.click(button('خيارات')); // the choir parts are in the song's options
    await user.upload(screen.getByLabelText(/ملف صوت "سوبرانو"/), new File([new Uint8Array(500)], 's.mp3', { type: 'audio/mpeg' }));
    await tick(50);
    await user.click(button('ألتو'));
    await user.upload(screen.getByLabelText(/ملف صوت "ألتو"/), new File([new Uint8Array(500)], 'a.mp3', { type: 'audio/mpeg' }));
    await tick(50);
    expect(getSongs()[0].parts).toHaveLength(2);
    expect(screen.getByRole('link', { name: /تدريب صوتك في الكورال/ })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'شيلي' })[0]);
    await tick(50);
    expect(getSongs()[0].parts).toHaveLength(1);
  });

  it('play all, mute a part, change a volume; leaving stops every part', async () => {
    audioControl.song = { seconds: 5, freqAt };
    media.duration = 5;
    const s = await choirSong();
    const { user } = renderApp(`songs/${s.id}/choir`);
    await tick(3000);
    await user.click(screen.getByRole('button', { name: /شغّلي|اسمعي الكل|كل الأصوات/ }));
    await tick(200);
    const playing = media.players.filter((p) => !p.paused);
    expect(playing.length).toBe(2);
    await user.click(screen.getAllByRole('button', { name: '🔊' })[0]);
    expect(screen.getAllByRole('button', { name: '🔇' })).toHaveLength(1);
    const slider = screen.getByLabelText('علو ألتو') as HTMLInputElement;
    expect(slider).toBeTruthy();
    await leaveApp();
    await returnToApp();
    await go('exercises');
    await tick(100);
    expect(media.players.every((p) => p.paused)).toBe(true);
  });
});
