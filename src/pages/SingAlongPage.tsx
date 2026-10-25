import { useEffect, useRef, useState } from 'react';
import { YouTubeMode } from './YouTubeMode';
import { Help } from '../components/Help';
import { audioLoopSource, LoopPractice, type LoopSource } from '../components/LoopPractice';
import { scoreRepeat } from '../lib/loop';
import { ErrorText, LiveNote, Page, SaveRecording, Stat } from '../components/ui';
import { PitchGraph } from '../components/PitchGraph';
import { useMic } from '../audio/useMic';
import { audioContext } from '../audio/audio';
import { compareCurves, type CompareResult, type PitchPoint } from '../lib/compare';
import { extractPitchCurve, toMono } from '../lib/pitchTrack';
import { addResult, getPref, getSongs, setPref } from '../lib/storage';
import { getSongFile } from '../audio/songFiles';
import type { Song } from '../lib/songs';

/** Rough delay between the music playing and her voice reaching the analyser (seconds). */
const LATENCY = 0.1;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Moment = { start: number; end: number };

/** Reference-file mode: note-by-note comparison with an audio file. */
function FileMode({ song, pendingLoop }: { song?: Song; pendingLoop?: Moment | null }) {
  const [refFile, setRefFile] = useState<File | null>(null);
  const [backingFile, setBackingFile] = useState<File | null>(null);
  const [curve, setCurve] = useState<PitchPoint[] | null>(null);
  const [analyzing, setAnalyzing] = useState(0); // 0 = not running, else progress 0..1
  const [recording, setRecording] = useState(false);
  const [sung, setSung] = useState<PitchPoint[] | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [recUrl, setRecUrl] = useState('');
  const [loopMoment, setLoopMoment] = useState<{ start: number; end: number } | null>(null);
  const loopSource = useRef<LoopSource | null>(null);
  const [err, setErr] = useState('');

  const player = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recOffset = useRef(0); // seconds of recording before the music started
  const frames = useRef<PitchPoint[]>([]);
  const recAudio = useRef<HTMLAudioElement>(null);

  const { frame, error, start, stop } = useMic((f) => {
    const p = player.current;
    if (!p || p.paused) return;
    frames.current.push({ t: Math.max(0, p.currentTime - LATENCY), freq: f.freq });
  });

  useEffect(
    () => () => {
      player.current?.pause();
      if (recUrl) URL.revokeObjectURL(recUrl);
    },
    [recUrl],
  );

  // a library song with a stored file: load it right away
  useEffect(() => {
    if (!song?.file) return;
    void getSongFile(song.id).then((f) => {
      if (!f) return setErr('ملف الأغنية مش موجود على الجهاز ده. اختاريه تاني من صفحة الأغنية أو من هنا.');
      const file = new File([f.bytes], f.name, { type: f.type });
      setRefFile(file);
      void analyze(file);
    });
  }, []);

  // "كرري الحتة دي" from the song page: open the loop once the reference is ready
  const loopDone = useRef(false);
  useEffect(() => {
    if (curve && pendingLoop && !loopDone.current) {
      loopDone.current = true;
      openLoop(pendingLoop.start, pendingLoop.end);
    }
  }, [curve]);

  const analyze = async (file: File) => {
    setErr('');
    loopSource.current?.pause();
    loopSource.current = null;
    setLoopMoment(null);
    setCurve(null);
    setResult(null);
    setSung(null);
    setAnalyzing(0.01);
    try {
      const buf = await audioContext().decodeAudioData(await file.arrayBuffer());
      const c = await extractPitchCurve(toMono(buf), buf.sampleRate, {}, (p) => setAnalyzing(Math.max(0.01, p)));
      setCurve(c);
    } catch (e) {
      setErr('معرفناش نقرا الملف ده. جربي ملف mp3 أو wav أو m4a. ' + String(e));
    }
    setAnalyzing(0);
  };

  const begin = async () => {
    if (!refFile || !curve) return;
    setResult(null);
    setSung(null);
    frames.current = [];
    const mic = await start();
    if (!mic) return;

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(mic.stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      setRecUrl(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
    };
    const recStart = performance.now();
    rec.start();
    recorder.current = rec;

    const audio = new Audio(URL.createObjectURL(backingFile ?? refFile));
    audio.onended = finish;
    player.current = audio;
    await audio.play();
    recOffset.current = (performance.now() - recStart) / 1000;
    setRecording(true);
  };

  function finish() {
    player.current?.pause();
    if (player.current) URL.revokeObjectURL(player.current.src);
    player.current = null;
    recorder.current?.stop();
    recorder.current = null;
    stop();
    setRecording(false);
    const s = [...frames.current];
    setSung(s);
    if (curve && s.length) {
      // Only score the part of the song she sang along to (she may stop early).
      const endT = s[s.length - 1].t;
      const r = compareCurves(s, curve.filter((p) => p.t <= endT));
      setResult(r);
      addResult('singalong', r.score, song?.title ?? refFile?.name, { songId: song?.id, moments: r.offRanges });
    }
  }

  /** Open the phrase loop on a moment; the loop plays the backing track if there is one, else the reference. */
  const openLoop = (start: number, end: number) => {
    if (!refFile || !curve) return;
    if (!loopSource.current) {
      const el = new Audio(URL.createObjectURL(backingFile ?? refFile));
      loopSource.current = audioLoopSource(el, curve[curve.length - 1]?.t ?? 0);
    }
    setLoopMoment({ start, end });
  };
  useEffect(() => () => loopSource.current?.pause(), []);

  const seek = (t: number) => {
    const a = recAudio.current;
    if (!a) return;
    a.currentTime = Math.max(0, t + recOffset.current - 0.5);
    void a.play();
  };

  return (
    <>
      <Help id="sing-file" />
      <p className="intro">حمّلي ملف صوت مرجعي (صوت المغني لوحده، أو مدرّستك وهي بتغني اللحن). هنطلع منه خط النغمات، وبعدين تغني معاه ونقارن — من غير ما يفرق لو غنيتي أوكتاف أعلى أو أوطى.</p>
      <ErrorText text={error || err} />
      <p className="hint">🎧 البسي سماعات عشان صوت الأغنية ميدخلش الميكروفون.</p>

      <div className="panel">
        <label className="file">
          <span>١. الصوت المرجعي (مطلوب){refFile ? ` — ${refFile.name}` : ''}</span>
          <input
            type="file"
            accept="audio/*"
            disabled={recording}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setRefFile(f);
              if (f) void analyze(f);
            }}
          />
        </label>
        <label className="file">
          <span>٢. موسيقى من غير صوت (اختياري — هتشتغل بدل المرجعي وانتي بتغني)</span>
          <input type="file" accept="audio/*" disabled={recording} onChange={(e) => setBackingFile(e.target.files?.[0] ?? null)} />
        </label>
        {analyzing > 0 && <p className="hint">بنحلل النغمات… {Math.round(analyzing * 100)}%</p>}
      </div>

      {curve && (
        <>
          <PitchGraph reference={curve} sung={sung ?? undefined} offRanges={result?.offRanges} onSeek={recUrl && !recording ? seek : undefined} />
          <p className="legend">
            <span className="swatch ref" /> المرجع <span className="swatch sung" /> صوتك <span className="swatch off" /> أماكن محتاجة تمرين
          </p>
          <div className="panel center">
            {recording ? (
              <>
                <LiveNote freq={frame?.freq ?? null} />
                <button className="big" onClick={finish}>
                  ⏹ وقفي
                </button>
              </>
            ) : (
              <>
                <button className="big primary" onClick={begin}>
                  🎤 {sung ? 'غني تاني' : 'ابدئي الغنا'}
                </button>
                <button onClick={() => openLoop(0, 3)}>🔁 تكرار جملة (اختاري البداية والنهاية)</button>
              </>
            )}
          </div>
        </>
      )}

      {loopMoment && loopSource.current && curve && !recording && (
        <LoopPractice
          key={`${loopMoment.start}-${loopMoment.end}`}
          source={loopSource.current}
          moment={loopMoment}
          reference={curve}
          score={(s, w) => scoreRepeat(s, curve, w)}
          label={song?.title ?? refFile?.name ?? 'ملف'}
          songId={song?.id}
          onClose={() => setLoopMoment(null)}
        />
      )}

      {result && !recording && (
        <div className="panel">
          <div className="stats">
            <Stat label="النتيجة" value={`${result.score}%`} />
            <Stat label="أماكن محتاجة تمرين" value={result.offRanges.length} />
          </div>
          {recUrl && <audio ref={recAudio} src={recUrl} controls className="rec" />}
          {recUrl && <SaveRecording url={recUrl} name={refFile?.name ?? 'song'} />}
          {result.offRanges.length > 0 && (
            <>
              <p className="hint">دوسي على أي وقت تسمعي نفسك فيه:</p>
              <ul className="off-list">
                {result.offRanges.map((r, i) => (
                  <li key={i} className="off-item">
                    <button onClick={() => seek(r.start)}>
                      <span dir="ltr">
                        {fmtTime(r.start)}–{fmtTime(r.end)}
                      </span>{' '}
                      {r.avgCents === null ? 'مكنتيش بتغني' : r.avgCents > 0 ? `أعلى بـ ${r.avgCents} سنت` : `أوطى بـ ${-r.avgCents} سنت`}
                    </button>
                    <button className="primary" onClick={() => openLoop(r.start, r.end)}>
                      🔁 كرري الحتة دي
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}

type Mode = 'file' | 'youtube';

/** Song + loop handed over from the library (read once when the page opens). */
function takeHandOff(): { song?: Song; loop: Moment | null } {
  const id = getPref('sing.song');
  const song = id ? getSongs().find((s) => s.id === id) : undefined;
  let loop: Moment | null = null;
  try {
    const raw = getPref('sing.loop');
    loop = raw ? JSON.parse(raw) : null;
  } catch {
    loop = null;
  }
  setPref('sing.loop', '');
  return { song, loop };
}

export function SingAlongPage() {
  const [mode, setMode] = useState<Mode>(() => (getPref('sing.mode') === 'youtube' ? 'youtube' : 'file'));
  const [handOff, setHandOff] = useState(takeHandOff);
  const song = handOff.song;
  const forget = () => {
    setPref('sing.song', '');
    setHandOff({ loop: null });
  };
  const choose = (m: Mode) => {
    setMode(m);
    setPref('sing.mode', m);
  };
  return (
    <Page tips mic title="غني مع الأغنية">
      <div className="choices">
        <button className={mode === 'file' ? 'chip active' : 'chip'} onClick={() => choose('file')}>
          🎵 ملف صوت (مقارنة باللحن)
        </button>
        <button className={mode === 'youtube' ? 'chip active' : 'chip'} onClick={() => choose('youtube')}>
          ▶️ يوتيوب (جوه السلم)
        </button>
      </div>
      {song && (
        <div className="notes song-banner">
          🎵 <b>{song.title}</b>
          {song.singer ? ` — ${song.singer}` : ''} (من مكتبتك){' '}
          <a href={`#/songs/${song.id}`}>صفحة الأغنية</a>{' '}
          <button className="link" onClick={forget}>
            مش من المكتبة ✕
          </button>
        </div>
      )}
      {mode === 'file' ? <FileMode key={song?.id ?? 'none'} song={song} pendingLoop={handOff.loop} /> : <YouTubeMode key={song?.id ?? 'none'} song={song} pendingLoop={handOff.loop} />}
    </Page>
  );
}
