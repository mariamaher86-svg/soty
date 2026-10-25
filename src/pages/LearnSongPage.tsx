import { useEffect, useRef, useState } from 'react';
import { ErrorText, Page } from '../components/ui';
import { audioLoopSource, LoopPractice, type LoopSource } from '../components/LoopPractice';
import { SoundPicker } from '../components/SoundPicker';
import { audioContext } from '../audio/audio';
import { getSongFile } from '../audio/songFiles';
import { playNote } from '../audio/sound';
import { adjustPhrase, phraseNotes, splitPhrases, type Phrase } from '../lib/phrases';
import { extractPitchCurve, toMono } from '../lib/pitchTrack';
import { scoreRepeat } from '../lib/loop';
import { midiToFreq, quarterToneName } from '../lib/music';
import { getPref, setPref } from '../lib/storage';
import type { PitchPoint } from '../lib/compare';
import type { Song } from '../lib/songs';

/** A phrase counts as learned at this score. */
export const PHRASE_GOOD = 70;
const SLOW = 0.75;

interface Progress {
  phrases: Phrase[];
  best: Record<number, number>;
}

export function getPhraseProgress(songId: string): Progress | null {
  try {
    const p = JSON.parse(getPref('phrases.' + songId) ?? 'null');
    return p && Array.isArray(p.phrases) ? p : null;
  } catch {
    return null;
  }
}

function savePhraseProgress(songId: string, p: Progress) {
  setPref('phrases.' + songId, JSON.stringify(p));
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** "تعلّمي الأغنية جملة جملة": listen → hear the notes slowly → sing with the meter until it's good → next phrase, then join phrases. */
export function LearnSongPage({ song }: { song: Song }) {
  const [curve, setCurve] = useState<PitchPoint[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(() => getPhraseProgress(song.id));
  const [i, setI] = useState(0);
  const [practice, setPractice] = useState<{ start: number; end: number; key: string } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(0);
  const source = useRef<LoopSource | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void (async () => {
      const f = await getSongFile(song.id);
      if (!f) return setErr('ملف الأغنية مش موجود على الجهاز ده. ضيفيه من «✏️ تعديل» في صفحة الأغنية.');
      const file = new File([f.bytes], f.name, { type: f.type });
      const el = new Audio(URL.createObjectURL(file));
      audio.current = el;
      try {
        setLoading(0.01);
        const buf = await audioContext().decodeAudioData(await file.arrayBuffer());
        const c = await extractPitchCurve(toMono(buf), buf.sampleRate, {}, (p) => setLoading(Math.max(0.01, p)));
        source.current = audioLoopSource(el, buf.duration);
        setCurve(c);
        setProgress((p) => {
          if (p && p.phrases.length) return p;
          const fresh = { phrases: splitPhrases(c), best: {} };
          savePhraseProgress(song.id, fresh);
          return fresh;
        });
      } catch (e) {
        setErr('معرفناش نقرا الملف: ' + String(e));
      }
      setLoading(0);
    })();
    return () => audio.current?.pause();
  }, [song.id]);

  const update = (p: Progress) => {
    setProgress(p);
    savePhraseProgress(song.id, p);
  };

  if (err) return <Page title={`تعلّم: ${song.title}`}><ErrorText text={err} /><a href={`#/songs/${song.id}`}>← صفحة الأغنية</a></Page>;
  if (!curve || !progress)
    return (
      <Page title={`تعلّم: ${song.title}`}>
        <p className="hint">بنحلل الأغنية… {Math.round(loading * 100)}%</p>
      </Page>
    );

  const phrases = progress.phrases;
  const ph = phrases[i];
  const duration = curve.length ? curve[curve.length - 1].t : 0;
  const notes = ph ? phraseNotes(curve, ph) : [];
  const learned = (k: number) => (progress.best[k] ?? 0) >= PHRASE_GOOD;

  const listen = () => {
    const el = audio.current;
    if (!el || !ph) return;
    el.playbackRate = SLOW;
    (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
    el.preservesPitch = true;
    el.currentTime = ph.start;
    void el.play();
    const stopAt = () => {
      if (el.currentTime >= ph.end) {
        el.pause();
        el.removeEventListener('timeupdate', stopAt);
      }
    };
    el.addEventListener('timeupdate', stopAt);
  };

  const slowNotes = async () => {
    for (const n of notes) await playNote(midiToFreq(n.midi), Math.max(0.3, Math.min(1.2, n.dur / SLOW)));
  };

  const adjust = (which: 'start' | 'end', delta: number) => {
    const next = [...phrases];
    next[i] = adjustPhrase(ph, which, delta, duration);
    update({ ...progress, phrases: next });
  };

  const onScore = (k: number | null) => (score: number) => {
    if (k === null) return;
    const best = Math.max(progress.best[k] ?? 0, score);
    const p = getPhraseProgress(song.id) ?? progress;
    update({ ...p, best: { ...p.best, [k]: best } });
  };

  return (
    <Page tips mic help="learn" title={`🎓 تعلّم: ${song.title}`} intro="جملة جملة: اسمعي الجملة ← اسمعي نغماتها ببطء على البيانو ← غنيها لحد ما النتيجة تبقى ٧٠٪ أو أكتر ← الجملة اللي بعدها. وبعدين جملتين مع بعض، والأغنية كلها.">
      <p className="hint">
        اتعلمتي {phrases.filter((_, k) => learned(k)).length} من {phrases.length} جمل.
      </p>
      <div className="choices">
        {phrases.map((_, k) => (
          <button key={k} className={k === i ? 'chip active' : learned(k) ? 'chip done' : 'chip'} onClick={() => {
              setI(k);
              setPractice(null);
            }}>
            {learned(k) ? '✔ ' : ''}جملة {k + 1}
          </button>
        ))}
      </div>

      {ph && (
        <div className="panel">
          <h2>
            جملة {i + 1} <small className="hint" dir="ltr">({fmt(ph.start)}–{fmt(ph.end)})</small>
          </h2>
          <div className="row">
            <span>البداية</span>
            <button onClick={() => adjust('start', -0.25)}>−</button>
            <button onClick={() => adjust('start', 0.25)}>+</button>
            <span>النهاية</span>
            <button onClick={() => adjust('end', -0.25)}>−</button>
            <button onClick={() => adjust('end', 0.25)}>+</button>
          </div>
          <h3>١. اسمعي</h3>
          <div className="row">
            <button onClick={listen}>🔊 اسمعي الجملة (بسرعة ٧٥٪)</button>
            <button onClick={slowNotes}>🎹 النغمات ببطء</button>
          </div>
          <SoundPicker />
          <div className="vocalise-notes">
            {notes.map((n, k) => (
              <span key={k}>
                <b>{quarterToneName(n.midi).ar.replace(/ -?\d+$/, '')}</b>
                <small dir="ltr">{quarterToneName(n.midi).name}</small>
              </span>
            ))}
            {!notes.length && <span className="hint">مفيش نغمات واضحة في الجملة دي — ظبطي البداية والنهاية.</span>}
          </div>
          <h3>٢. غني</h3>
          <div className="row">
            <button className="primary" onClick={() => setPractice({ start: ph.start, end: ph.end, key: `p${i}-${Date.now()}` })}>
              🎤 غني الجملة دي
            </button>
            {i + 1 < phrases.length && learned(i) && (
              <button onClick={() => setPractice({ start: ph.start, end: phrases[i + 1].end, key: `j${i}-${Date.now()}` })}>🔗 جملة {i + 1} + {i + 2} مع بعض</button>
            )}
            {phrases.every((_, k) => learned(k)) && <button onClick={() => setPractice({ start: 0, end: duration, key: `all-${Date.now()}` })}>🎵 الأغنية كلها</button>}
          </div>
          {progress.best[i] !== undefined && (
            <p className={learned(i) ? 'ok-text' : 'hint'}>
              أحسن نتيجة للجملة دي: {progress.best[i]}% {learned(i) ? '— اتعلمت ✔' : `(الهدف ${PHRASE_GOOD}%)`}
            </p>
          )}
          {learned(i) && i + 1 < phrases.length && (
            <button className="big primary" onClick={() => {
              setI(i + 1);
              setPractice(null);
            }}>
              الجملة اللي بعدها ←
            </button>
          )}
        </div>
      )}

      {practice && source.current && (
        <LoopPractice
          key={practice.key}
          source={source.current}
          moment={practice}
          pad={0.3}
          reference={curve}
          score={(s, w) => scoreRepeat(s, curve, w)}
          label={`${song.title} — جملة ${i + 1}`}
          songId={song.id}
          onScore={onScore(practice.key.startsWith('p') ? i : null)}
          onClose={() => setPractice(null)}
        />
      )}
    </Page>
  );
}
