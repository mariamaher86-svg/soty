import { useEffect, useRef, useState } from 'react';
import { ErrorText, Page, Stat } from '../components/ui';
import { LoopPractice, type LoopSource } from '../components/LoopPractice';
import { audioContext } from '../audio/audio';
import { deleteSongFile, getSongFile, mb, saveSongFile } from '../audio/songFiles';
import { CHOIR_MODES, mixGains, modeGains, PART_PRESETS, partKey, partOctave, syncTarget, type ChoirMode, type SongPart } from '../lib/choir';
import { extractPitchCurve, toMono } from '../lib/pitchTrack';
import { splitPhrases, type Phrase } from '../lib/phrases';
import { scoreRepeat } from '../lib/loop';
import { getPref, getSongs, saveSongs, setPref } from '../lib/storage';
import type { PitchPoint } from '../lib/compare';
import type { Song } from '../lib/songs';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Song page: add / remove choir part recordings. */
export function ChoirPartsPanel({ song, onChanged }: { song: Song; onChanged: () => void }) {
  const [name, setName] = useState(PART_PRESETS[0]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const parts = song.parts ?? [];

  const add = async (file: File | undefined) => {
    if (!file || !name.trim()) return;
    setErr('');
    setBusy(true);
    const id = 'p' + Date.now().toString(36);
    const res = await saveSongFile({ songId: partKey(song.id, id), name: file.name, type: file.type || 'audio/mpeg', bytes: await file.arrayBuffer() });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    const part: SongPart = { id, name: name.trim(), file: { name: file.name, type: file.type || 'audio/mpeg', size: file.size } };
    saveSongs(getSongs().map((s) => (s.id === song.id ? { ...s, parts: [...(s.parts ?? []), part], updatedAt: Date.now() } : s)));
    onChanged();
  };

  const remove = async (p: SongPart) => {
    await deleteSongFile(partKey(song.id, p.id));
    saveSongs(getSongs().map((s) => (s.id === song.id ? { ...s, parts: (s.parts ?? []).filter((x) => x.id !== p.id), updatedAt: Date.now() } : s)));
    onChanged();
  };

  return (
    <div className="panel">
      <h2>🎼 أصوات الكورال</h2>
      <p className="hint">ملف لكل صوت (سوبرانو، ألتو، تينور، باص…) — بيتسمعوا مع بعض في "تدريب صوتك في الكورال".</p>
      {parts.length > 0 && (
        <ul className="teacher-list">
          {parts.map((p) => (
            <li key={p.id}>
              <span>
                <b>{p.name}</b> <small className="hint">{p.file.name} ({mb(p.file.size)})</small>
              </span>
              <button className="danger" onClick={() => remove(p)}>
                شيلي
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="choices">
        {PART_PRESETS.map((n) => (
          <button key={n} className={n === name ? 'chip active' : 'chip'} onClick={() => setName(n)}>
            {n}
          </button>
        ))}
        <input className="tag-input" placeholder="اسم تاني…" value={PART_PRESETS.includes(name) ? '' : name} onChange={(e) => setName(e.target.value || PART_PRESETS[0])} />
      </div>
      <label className="file">
        <span>ملف صوت "{name}"</span>
        <input type="file" accept="audio/*" disabled={busy} onChange={(e) => void add(e.target.files?.[0])} />
      </label>
      <ErrorText text={err} />
      {parts.length >= 2 && (
        <a className="button-link primary" href={`#/songs/${song.id}/choir`}>
          🎼 تدريب صوتك في الكورال
        </a>
      )}
    </div>
  );
}

interface Loaded {
  part: SongPart;
  el: HTMLAudioElement;
  gain: GainNode;
}

/** All parts as one loop source: her part leads, the others follow it (re-synced when they drift). */
function groupSource(all: Loaded[], leader: number, duration: number): LoopSource {
  const lead = () => all[leader].el;
  return {
    duration: () => duration,
    currentTime: () => lead().currentTime,
    play: () => {
      const t = lead().currentTime;
      for (const p of all) {
        p.el.currentTime = t;
        void p.el.play();
      }
    },
    pause: () => all.forEach((p) => p.el.pause()),
    seek: (t) => all.forEach((p) => (p.el.currentTime = t)),
    rates: () => [1, 0.85, 0.75],
    setRate: (r) =>
      all.forEach((p) => {
        p.el.playbackRate = r;
        p.el.defaultPlaybackRate = r;
      }),
    playing: () => !lead().paused,
    rateNote: 'السرعة الأبطأ لكل الأصوات مع بعض، والطبقة مابتتغيرش.',
  };
}

/** #/songs/<id>/choir */
export function ChoirPage({ song }: { song: Song }) {
  const parts = song.parts ?? [];
  const [mine, setMine] = useState(() => Math.min(parts.length - 1, Math.max(0, Number(getPref('choir.mine.' + song.id) ?? 0))));
  const [mode, setMode] = useState<ChoirMode>('mineLoud');
  const [volumes, setVolumes] = useState<number[]>(() => parts.map(() => 1));
  const [muted, setMuted] = useState<boolean[]>(() => parts.map(() => false));
  const [repeat, setRepeat] = useState(0);
  const [curves, setCurves] = useState<(PitchPoint[] | null)[]>(() => parts.map(() => null));
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [phrase, setPhrase] = useState<{ start: number; end: number; key: string } | null>(null);
  const [octave, setOctave] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [playingAll, setPlayingAll] = useState(false);
  const sourceRef = useRef<LoopSource | null>(null);

  // load every part: an audio element each, mixed through Web Audio for per-part volume
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ac = audioContext();
      const out: Loaded[] = [];
      let dur = 0;
      for (const part of parts) {
        const f = await getSongFile(partKey(song.id, part.id));
        if (!f) {
          setErr(`ملف "${part.name}" مش موجود على الجهاز ده.`);
          continue;
        }
        const el = new Audio(URL.createObjectURL(new File([f.bytes], f.name, { type: f.type })));
        el.preservesPitch = true;
        (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
        const gain = ac.createGain();
        ac.createMediaElementSource(el).connect(gain).connect(ac.destination);
        out.push({ part, el, gain });
        try {
          const buf = await ac.decodeAudioData(f.bytes.slice(0));
          dur = Math.max(dur, buf.duration);
          const c = await extractPitchCurve(toMono(buf), buf.sampleRate);
          if (!cancelled) setCurves((cur) => cur.map((x, i) => (parts[i].id === part.id ? c : x)));
        } catch {
          // a part that can't be analysed still plays
        }
      }
      if (cancelled) return out.forEach((p) => p.el.pause());
      setLoaded(out);
      setDuration(dur);
    })();
    return () => {
      cancelled = true;
    };
  }, [song.id]);

  useEffect(() => () => loaded?.forEach((p) => p.el.pause()), [loaded]);

  // apply the mode / sliders / mute to the mix
  const gains = mixGains(modeGains(mode, parts.length, mine, repeat), volumes, muted);
  useEffect(() => {
    loaded?.forEach((p) => {
      const i = parts.findIndex((x) => x.id === p.part.id);
      p.gain.gain.value = gains[i] ?? 0;
    });
  });

  // keep followers in sync with her part while playing
  useEffect(() => {
    if (!loaded) return;
    let raf = 0;
    const tick = () => {
      const lead = loaded.find((p) => p.part.id === parts[mine]?.id)?.el;
      if (lead && !lead.paused) for (const p of loaded) if (p.el !== lead) {
        const t = syncTarget(lead.currentTime, p.el.currentTime);
        if (t !== null) p.el.currentTime = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loaded, mine]);

  if (parts.length < 2) return <Page title="تدريب صوتك في الكورال"><p>محتاجين صوتين على الأقل في "🎼 أصوات الكورال" في صفحة الأغنية.</p></Page>;
  if (!loaded) return <Page title={`🎼 ${song.title}`}><p className="hint">بنحمّل الأصوات…</p></Page>;

  const leaderIdx = loaded.findIndex((p) => p.part.id === parts[mine].id);
  sourceRef.current = leaderIdx >= 0 ? groupSource(loaded, leaderIdx, duration) : null;
  const myCurve = curves[mine];
  const phrases: Phrase[] = myCurve ? splitPhrases(myCurve) : [];

  const toggleAll = () => {
    const src = sourceRef.current;
    if (!src) return;
    audioContext();
    if (playingAll) {
      src.pause();
      setPlayingAll(false);
    } else {
      src.play();
      setPlayingAll(true);
    }
  };

  return (
    <Page tips mic help="choir" title={`🎼 ${song.title}`} intro="اختاري صوتك، واختاري إزاي تسمعي الكورال، وبعدين غني جملة جملة.">
      <ErrorText text={err} />
      <div className="panel">
        <h2>١. صوتك</h2>
        <div className="choices">
          {parts.map((p, i) => (
            <button
              key={p.id}
              className={i === mine ? 'chip active' : 'chip'}
              onClick={() => {
                setMine(i);
                setPref('choir.mine.' + song.id, String(i));
                setRepeat(0);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <h2>٢. إزاي تسمعي</h2>
        <div className="choices">
          {CHOIR_MODES.map((m) => (
            <button
              key={m.id}
              className={m.id === mode ? 'chip active' : 'chip'}
              onClick={() => {
                setMode(m.id);
                setRepeat(0);
              }}
            >
              {m.ar}
            </button>
          ))}
        </div>
        <p className="hint">{CHOIR_MODES.find((m) => m.id === mode)!.what}</p>
        <div className="mixer">
          {parts.map((p, i) => (
            <div key={p.id} className="mixer-row">
              <span>
                {i === mine ? '⭐ ' : ''}
                {p.name}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volumes[i]}
                aria-label={`علو ${p.name}`}
                onChange={(e) => setVolumes((v) => v.map((x, k) => (k === i ? Number(e.target.value) : x)))}
              />
              <button className={muted[i] ? 'chip active' : 'chip'} onClick={() => setMuted((m) => m.map((x, k) => (k === i ? !x : x)))}>
                {muted[i] ? '🔇' : '🔊'}
              </button>
              <small className="hint">{Math.round((gains[i] ?? 0) * 100)}%</small>
            </div>
          ))}
        </div>
        <button className="big" onClick={toggleAll}>
          {playingAll ? '⏸ وقفي' : '▶️ شغّلي الكورال من الأول'}
        </button>
      </div>

      <div className="panel">
        <h2>٣. غني جملة جملة</h2>
        {!myCurve ? (
          <p className="hint">بنحلل صوت "{parts[mine].name}"…</p>
        ) : (
          <>
            <div className="choices">
              {phrases.map((ph, k) => (
                <button key={k} className="chip" onClick={() => setPhrase({ start: ph.start, end: ph.end, key: `${k}-${Date.now()}` })}>
                  جملة {k + 1} <small dir="ltr">({fmt(ph.start)})</small>
                </button>
              ))}
              <button className="chip" onClick={() => setPhrase({ start: 0, end: duration, key: `all-${Date.now()}` })}>
                الأغنية كلها
              </button>
            </div>
            {mode === 'fade' && <p className="hint">صوتك دلوقتي: {Math.round((modeGains('fade', parts.length, mine, repeat)[mine] ?? 0) * 100)}% — بيوطى مع كل مرة.</p>}
            {octave !== null && octave !== 0 && (
              <p className="hint">
                إنتي بتغني الصوت ده {octave < 0 ? 'أوطى' : 'أعلى'} بـ {Math.abs(octave)} أوكتاف — ده عادي، والنتيجة مش بتتأثر.
              </p>
            )}
          </>
        )}
        {repeat > 0 && <Stat label="عدد المرات" value={repeat} />}
      </div>

      {phrase && sourceRef.current && myCurve && (
        <LoopPractice
          key={phrase.key}
          source={sourceRef.current}
          moment={phrase}
          pad={0.3}
          reference={myCurve}
          score={(s, w) => {
            setOctave(partOctave(s, myCurve));
            return scoreRepeat(s, myCurve, w);
          }}
          label={`${song.title} — ${parts[mine].name}`}
          songId={song.id}
          onScore={() => setRepeat((r) => r + 1)}
          onClose={() => setPhrase(null)}
        />
      )}
    </Page>
  );
}
