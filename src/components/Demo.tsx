// Demos for exercises: a YouTube *search* link (we can't vouch for specific videos), a drawn breathing
// illustration, and a gliding "siren" sound.

import { audioContext } from '../audio/audio';
import { midiToFreq } from '../lib/music';
import { VIDEOS, youtubeSearchUrl, type VideoKey } from '../content/videos';
import { useOnline } from '../audio/offline';

/** "▶️ شوفي الطريقة على يوتيوب": a YouTube search in Arabic or English (queries in content/videos.ts). */
export function YouTubeSearch({ k }: { k: VideoKey }) {
  const v = VIDEOS[k];
  const online = useOnline();
  if (!online) return <span className="yt-search off">▶️ فيديوهات يوتيوب محتاجة إنترنت.</span>;
  return (
    <span className="yt-search">
      <span>▶️ فيديو للطريقة:</span>
      <a className="tool-chip" href={youtubeSearchUrl(v.ar)} target="_blank" rel="noopener noreferrer">
        بالعربي
      </a>
      <a className="tool-chip" href={youtubeSearchUrl(v.en)} target="_blank" rel="noopener noreferrer" dir="ltr">
        English
      </a>
    </span>
  );
}

/** Belly breathing: the belly grows on the inhale and goes back on the exhale (animated). */
export function BreathIllustration() {
  return (
    <figure className="breath-ill" aria-label="رسم: البطن بتكبر مع الشهيق وبترجع مع الزفير">
      <svg viewBox="0 0 120 140" width="120" height="140">
        <circle cx="60" cy="22" r="16" className="body" />
        <rect x="44" y="40" width="32" height="40" rx="10" className="body" />
        <ellipse cx="60" cy="88" rx="20" ry="16" className="belly" />
        <rect x="46" y="100" width="10" height="34" rx="4" className="body" />
        <rect x="64" y="100" width="10" height="34" rx="4" className="body" />
      </svg>
      <figcaption>
        شهيق: البطن تكبر ⬅ زفير: البطن ترجع.
        <br />
        الكتاف ثابتة ونازلة.
      </figcaption>
    </figure>
  );
}

/** A smooth glide up and back down (demo for the siren). */
export function playGlide(lowMidi: number, highMidi: number, seconds = 4): Promise<void> {
  const ac = audioContext();
  const t0 = ac.currentTime + 0.05;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(midiToFreq(lowMidi), t0);
  o.frequency.exponentialRampToValueAtTime(midiToFreq(highMidi), t0 + seconds / 2);
  o.frequency.exponentialRampToValueAtTime(midiToFreq(lowMidi), t0 + seconds);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.22, t0 + 0.15);
  g.gain.setValueAtTime(0.22, t0 + seconds - 0.2);
  g.gain.linearRampToValueAtTime(0, t0 + seconds);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + seconds + 0.05);
  return new Promise((resolve) => setTimeout(resolve, (seconds + 0.2) * 1000));
}
