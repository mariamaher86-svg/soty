import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, renderApp, tick } from '../test/app';
import { audioControl } from '../test/fakeAudio';
import { media } from '../test/fakeMedia';
import { mic } from '../test/fakeMic';
import { youtube } from '../test/fakeYouTube';
import { getResults, getSongs, saveSongs, setPref } from '../lib/storage';
import { saveSongFile } from '../audio/songFiles';
import { normalizeSong } from '../lib/songs';
import { midiToFreq } from '../lib/music';

/** A 4-second song: A3, C4, D4, E4, one second each. */
const MELODY = [57, 60, 62, 64];
const melodyAt = (t: number) => (t >= 0 && t < MELODY.length ? midiToFreq(MELODY[Math.floor(t)]) : null);

async function songWithFile(extra: object = {}) {
  const s = normalizeSong({ title: 'أغنية الملف', ...extra });
  await saveSongFile({ songId: s.id, name: 'song.mp3', type: 'audio/mpeg', bytes: new Uint8Array(4000).buffer });
  s.file = { name: 'song.mp3', type: 'audio/mpeg', size: 4000 };
  saveSongs([...getSongs(), s]);
  setPref('sing.song', s.id);
  setPref('sing.mode', 'file');
  return s;
}

describe('sing along: file mode', () => {
  it('a library song loads and is analysed; singing it in tune scores high and is saved with the song', async () => {
    audioControl.song = { seconds: 4, freqAt: melodyAt };
    media.duration = 4;
    const s = await songWithFile();
    const { user } = renderApp('sing');
    await tick(3000); // analysing
    await user.click(button(/ابدئي الغنا/));
    await tick(10);
    const player = media.last!;
    mic.at = () => ({ freq: melodyAt(player.currentTime) });
    await tick(4500); // the song ends by itself
    const r = getResults().filter((x) => x.type === 'singalong');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeGreaterThanOrEqual(80);
    expect(r[0].songId).toBe(s.id);
    expect(mic.open).toBe(0);
    expect(media.recorders[0].state).toBe('inactive');
    expect(button(/غني تاني/)).toBeTruthy();
  });

  it('singing a tone too high marks places that need practice and offers to loop them', async () => {
    audioControl.song = { seconds: 4, freqAt: melodyAt };
    await songWithFile();
    const { user } = renderApp('sing');
    await tick(3000);
    await user.click(button(/ابدئي الغنا/));
    await tick(10);
    const player = media.last!;
    mic.at = () => ({ freq: player.currentTime > 2 ? melodyAt(player.currentTime)! * 1.12 : melodyAt(player.currentTime) });
    await tick(4500);
    expect(getResults()[0].value).toBeLessThan(80);
    expect(screen.getAllByRole('button', { name: /كرري|تكرار/ }).length).toBeGreaterThan(0);
  });

  it('stopping early scores only what she sang', async () => {
    audioControl.song = { seconds: 4, freqAt: melodyAt };
    await songWithFile();
    const { user } = renderApp('sing');
    await tick(3000);
    await user.click(button(/ابدئي الغنا/));
    await tick(10);
    const player = media.last!;
    mic.at = () => ({ freq: melodyAt(player.currentTime) });
    await tick(2000);
    await user.click(button('⏹ وقفي'));
    expect(getResults()[0].value).toBeGreaterThanOrEqual(80);
    expect(player.paused).toBe(true);
  });

  it('a missing file says so instead of hanging', async () => {
    const s = normalizeSong({ title: 'ملف ضايع' });
    s.file = { name: 'x.mp3', type: 'audio/mpeg', size: 10 };
    saveSongs([s]);
    setPref('sing.song', s.id);
    setPref('sing.mode', 'file');
    renderApp('sing');
    await tick(200);
    expect(screen.getByText(/ملف الأغنية مش موجود على الجهاز ده/)).toBeTruthy();
  });

  it('a file that cannot be decoded shows a message', async () => {
    audioControl.decodeFails = true;
    await songWithFile();
    renderApp('sing');
    await tick(500);
    expect(screen.getByText(/معرفناش نقرا الملف ده/)).toBeTruthy();
  });

  it('play() refused by the phone: a message, and the mic is let go', async () => {
    audioControl.song = { seconds: 4, freqAt: melodyAt };
    await songWithFile();
    media.playFails = true;
    const { user } = renderApp('sing');
    await tick(3000);
    await user.click(button(/ابدئي الغنا/));
    await tick(50);
    expect(screen.getByText(/معرفناش نشغّل الأغنية/)).toBeTruthy();
    expect(mic.open).toBe(0);
  });
});

describe('sing along: YouTube mode', () => {
  it('paste a link, the video loads, sing in the scale; finishing saves "in the scale" %', async () => {
    setPref('sing.mode', 'youtube');
    const { user } = renderApp('sing');
    await user.type(screen.getByLabelText('لينك الفيديو من يوتيوب'), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(button('افتحي'));
    await tick(20);
    expect(youtube.last!.videoId).toBe('dQw4w9WgXcQ');
    await user.click(button(/شغّلي وغني/));
    expect(youtube.last!.state).toBe(1);
    for (let i = 0; i < 30; i++) {
      youtube.last!.advance(0.1);
      mic.sing(60); // C: in C major
      await tick(100);
    }
    await user.click(button('⏹ خلصت'));
    const r = getResults().filter((x) => x.type === 'scale');
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeGreaterThanOrEqual(90);
    expect(youtube.last!.state).toBe(2);
  });

  it('a link that is not YouTube is refused with a hint', async () => {
    setPref('sing.mode', 'youtube');
    const { user } = renderApp('sing');
    await user.type(screen.getByLabelText('لينك الفيديو من يوتيوب'), 'https://example.com/x');
    await user.click(button('افتحي'));
    expect(screen.getByText(/اللينك ده مش لينك يوتيوب/)).toBeTruthy();
  });

  it('a video that cannot be embedded explains why', async () => {
    setPref('sing.mode', 'youtube');
    youtube.failWith = 150;
    const { user } = renderApp('sing');
    await user.type(screen.getByLabelText('لينك الفيديو من يوتيوب'), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(button('افتحي'));
    await tick(20);
    expect(screen.getByText(/صاحب الفيديو مش سامح/)).toBeTruthy();
  });

  it('the video ending by itself finishes the round', async () => {
    setPref('sing.mode', 'youtube');
    const { user } = renderApp('sing');
    await user.type(screen.getByLabelText('لينك الفيديو من يوتيوب'), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(button('افتحي'));
    await tick(20);
    youtube.last!.duration = 2;
    await user.click(button(/شغّلي وغني/));
    mic.sing(62);
    for (let i = 0; i < 25; i++) {
      youtube.last!.advance(0.1);
      await tick(100);
    }
    expect(getResults().filter((x) => x.type === 'scale')).toHaveLength(1);
    expect(mic.open).toBe(0);
  });
});
