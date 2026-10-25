import { useEffect, useRef, useState } from 'react';
import { ErrorText, LiveNote, SaveRecording, Stat } from '../components/ui';
import { PitchGraph } from '../components/PitchGraph';
import { KeyDetector } from '../components/KeyDetector';
import { Help } from '../components/Help';
import { useOnline } from '../audio/offline';
import { LoopPractice, type LoopSource } from '../components/LoopPractice';
import { useMic } from '../audio/useMic';
import { loadYouTubeApi, YT_STATE, youTubeErrorMessage, type YTPlayer } from '../audio/youtubePlayer';
import { checkScale, nearestDegree, SCALES, spellScale, tonicName, type ScaleCheck } from '../lib/scale';
import { midiToFreq } from '../lib/music';
import { parseYouTubeId } from '../lib/youtube';
import { addResult, getPref, setPref } from '../lib/storage';
import type { PitchPoint } from '../lib/compare';
import type { Song } from '../lib/songs';

/** Rough delay between the video sound and her voice reaching the analyser (seconds). */
const LATENCY = 0.1;
const TOLERANCE = 40;
const LIVE_SECONDS = 8;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Always-visible reminders for this mode. */
function Notes() {
  return (
    <div className="notes" role="note">
      <b>تنبيهات مهمة:</b>
      <ul>
        <li>🎧 البسي سماعات. من غيرها الميكروفون هيسمع الأغنية وقراءة صوتك هتبوظ.</li>
        <li>التطبيق مش بيقدر يسمع صوت اليوتيوب نفسه (المتصفح مش بيدّيه الصوت)، فهو بيشوف بس إنتي فضلتي جوه سلم/مقام الأغنية ولا لأ — <b>مش</b> بيقارنك بلحن المغني نغمة بنغمة.</li>
        <li>عشان مقارنة نغمة بنغمة مع المغني: استخدمي ملف صوت بتاعك (مثلاً MP3 اشتريتيه) في وضع "ملف صوت"، ويفضّل فصل صوت المغني عن الموسيقى الأول ببرنامج فصل صوت.</li>
        <li>تنزيل الصوت من يوتيوب ضد شروط يوتيوب، فالتطبيق مش بيعمل كده.</li>
        <li>🌐 الوضع ده محتاج إنترنت (عكس باقي التطبيق).</li>
      </ul>
    </div>
  );
}

export function YouTubeMode({ song, pendingLoop }: { song?: Song; pendingLoop?: { start: number; end: number } | null } = {}) {
  const [url, setUrl] = useState(song?.youtube ?? '');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [tonicPc, setTonicPc] = useState(() => {
    const t = Number(getPref('yt.tonic') ?? 7);
    return t >= 0 && t < 12 && Number.isInteger(t * 2) ? t : 7;
  });
  const [scaleId, setScaleId] = useState(() => getPref('yt.scale') ?? 'major');
  const [detecting, setDetecting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState<PitchPoint[]>([]);
  const [sung, setSung] = useState<PitchPoint[] | null>(null);
  const [result, setResult] = useState<ScaleCheck | null>(null);
  const [recUrl, setRecUrl] = useState('');

  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const frames = useRef<PitchPoint[]>([]);
  const timeMap = useRef<{ video: number; rec: number }[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const recStart = useRef(0);
  const lastLive = useRef(0);
  const recAudio = useRef<HTMLAudioElement>(null);
  const finishRef = useRef<() => void>(() => {});
  const [loopMoment, setLoopMoment] = useState<{ start: number; end: number } | null>(null);

  /** The YouTube player as a loop source (seekTo / getCurrentTime; YouTube keeps the pitch at slower speeds). */
  const ytSource = (p: YTPlayer): LoopSource => ({
    duration: () => p.getDuration(),
    currentTime: () => p.getCurrentTime(),
    play: () => p.playVideo(),
    pause: () => p.pauseVideo(),
    seek: (t) => p.seekTo(t, true),
    rates: () => {
      let rs: number[] = [];
      try {
        rs = p.getAvailablePlaybackRates();
      } catch {
        // older players
      }
      return [1, ...rs.filter((r) => r < 1 && r >= 0.5).sort((a, b) => b - a)];
    },
    setRate: (r) => p.setPlaybackRate(r),
    playing: () => p.getPlayerState() === YT_STATE.PLAYING,
    rateNote: 'يوتيوب نفسه بيخلي الطبقة زي ما هي لما السرعة تقل.',
  });

  const scale = SCALES.find((s) => s.id === scaleId) ?? SCALES[0];
  const tonicFreq = midiToFreq(60 + tonicPc);
  const spelled = spellScale(tonicPc, scale.pcs, scale.flats);
  const degreeName = (pc: number) => spelled.find((n) => n.pc === pc)?.name ?? '';

  const { frame, error, start, stop } = useMic((f) => {
    const p = player.current;
    if (!recording || !p || p.getPlayerState() !== YT_STATE.PLAYING) return;
    const t = Math.max(0, p.getCurrentTime() - LATENCY);
    frames.current.push({ t, freq: f.freq });
    timeMap.current.push({ video: t, rec: (performance.now() - recStart.current) / 1000 });
    if (f.t - lastLive.current > 150) {
      lastLive.current = f.t;
      setLive(frames.current.filter((x) => x.t >= t - LIVE_SECONDS && x.t <= t + 0.5));
    }
  });

  useEffect(() => setPref('yt.tonic', String(tonicPc)), [tonicPc]);
  useEffect(() => setPref('yt.scale', scaleId), [scaleId]);
  useEffect(
    () => () => {
      player.current?.destroy();
      recorder.current?.stop();
    },
    [],
  );
  useEffect(() => () => void (recUrl && URL.revokeObjectURL(recUrl)), [recUrl]);

  // a library song: open its video and key right away
  useEffect(() => {
    if (song?.tonic !== undefined) setTonicPc(song.tonic);
    if (song?.scaleId) setScaleId(song.scaleId);
    if (song?.youtube) void loadVideo(song.youtube);
  }, []);
  const loopDone = useRef(false);
  useEffect(() => {
    if (ready && pendingLoop && !loopDone.current) {
      loopDone.current = true;
      setLoopMoment(pendingLoop);
    }
  }, [ready]);

  const loadVideo = async (link = url) => {
    setErr('');
    const id = parseYouTubeId(link);
    if (!id) return setErr('اللينك ده مش لينك يوتيوب. انسخي لينك الفيديو من زرار "مشاركة" وحطيه هنا.');
    setReady(false);
    setResult(null);
    setSung(null);
    setVideoId(id);
    try {
      const YT = await loadYouTubeApi();
      player.current?.destroy();
      const el = document.createElement('div');
      box.current!.replaceChildren(el);
      player.current = new YT.Player(el, {
        videoId: id,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e) => e.data === YT_STATE.ENDED && finishRef.current(),
          onError: (e) => setErr(youTubeErrorMessage(e.data)),
        },
      });
    } catch {
      setErr('معرفناش نفتح يوتيوب. اتأكدي إنك متوصلة بالإنترنت، وإن مفيش إضافة (زي مانع الإعلانات) بتمنع يوتيوب.');
    }
  };

  const begin = async () => {
    setResult(null);
    setSung(null);
    setLive([]);
    frames.current = [];
    timeMap.current = [];
    const mic = await start();
    if (!mic || !player.current) return;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(mic.stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => setRecUrl(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
    recStart.current = performance.now();
    rec.start();
    recorder.current = rec;
    setRecording(true);
    player.current.playVideo();
  };

  const finish = () => {
    if (!recorder.current) return;
    player.current?.pauseVideo();
    recorder.current.stop();
    recorder.current = null;
    stop();
    setRecording(false);
    const s = [...frames.current].sort((a, b) => a.t - b.t);
    setSung(s);
    const r = checkScale(s, tonicFreq, scale.pcs, TOLERANCE);
    setResult(r);
    if (s.some((p) => p.freq)) addResult('scale', r.percentInScale, song?.title ?? `${tonicName(tonicPc).name} ${scale.ar}`, { songId: song?.id, moments: r.outRanges });
  };
  finishRef.current = finish;

  /** Play her recording from a video time. */
  const seekRecording = (videoT: number) => {
    const a = recAudio.current;
    if (!a || !timeMap.current.length) return;
    let best = timeMap.current[0];
    for (const m of timeMap.current) if (Math.abs(m.video - videoT) < Math.abs(best.video - videoT)) best = m;
    a.currentTime = Math.max(0, best.rec - 0.5);
    void a.play();
  };

  const guides = [];
  for (let base = 24 + tonicPc; base < 96; base += 12) for (const pc of scale.pcs) guides.push({ midi: base + pc / 100, tonic: pc === 0 });

  const liveDeg = recording && frame?.freq ? nearestDegree(frame.freq, tonicFreq, scale.pcs) : null;
  const liveOk = liveDeg ? Math.abs(liveDeg.cents) <= TOLERANCE : null;

  return (
    <>
      <Help id="sing-youtube" />
      <OfflineNote />
      <Notes />
      <ErrorText text={error || err} />

      <div className="panel">
        <label className="file">
          <span>لينك الفيديو من يوتيوب</span>
          <div className="url-row">
            <input
              type="url"
              dir="ltr"
              inputMode="url"
              placeholder="https://youtu.be/..."
              value={url}
              disabled={recording}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadVideo()}
            />
            <button className="primary" disabled={recording || !url.trim()} onClick={() => loadVideo()}>
              افتحي
            </button>
          </div>
        </label>

        <div className="key-row">
          <span>سلم الأغنية:</span>
          <select aria-label="القرار" value={tonicPc} disabled={recording} onChange={(e) => setTonicPc(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => i / 2).map((t) => (
              <option key={t} value={t}>
                {tonicName(t).name} — {tonicName(t).ar}
                {Number.isInteger(t) ? '' : ' (ربع تون)'}
              </option>
            ))}
          </select>
          <select aria-label="نوع السلم أو المقام" value={scaleId} disabled={recording} onChange={(e) => setScaleId(e.target.value)}>
            {SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.ar}
              </option>
            ))}
          </select>
          <button disabled={recording} onClick={() => setDetecting((d) => !d)}>
            🔎 اكتشف المقام
          </button>
        </div>
        <p className="hint">
          مثال: "احنا جنود ويسوعنا قائدنا" = <span dir="ltr">G</span> ماجير. النغمات المسموحة:{' '}
          <span dir="ltr">{spelled.map((n) => n.name).join(' ')}</span>
        </p>
      </div>

      {detecting && !recording && (
        <KeyDetector
          onUse={(t, id) => {
            setTonicPc(t);
            setScaleId(id);
            setDetecting(false);
          }}
        />
      )}

      {/* always mounted so the player can attach right away; React never renders children into it */}
      <div className={videoId ? 'yt-box' : ''} hidden={!videoId} ref={box} />

      {videoId && (
        <div className="panel center">
          {recording ? (
            <>
              <LiveNote freq={frame?.freq ?? null} />
              <p className={'guide' + (liveOk ? ' ok-text' : '')}>
                {liveDeg === null ? '…' : liveOk ? 'جوه السلم ✔' : `برا السلم — أقرب نغمة ${degreeName(liveDeg.pc)}`}
              </p>
              {live.length > 1 && <PitchGraph reference={[]} sung={live} guides={guides} startT={Math.max(0, live[live.length - 1].t - LIVE_SECONDS)} />}
              <button className="big" onClick={finish}>
                ⏹ خلصت
              </button>
            </>
          ) : (
            <button className="big primary" disabled={!ready} onClick={begin}>
              🎤 {ready ? (sung ? 'غني تاني' : 'شغّلي وغني') : 'الفيديو بيحمّل…'}
            </button>
          )}
        </div>
      )}

      {videoId && ready && !recording && !loopMoment && (
        <button onClick={() => setLoopMoment({ start: player.current?.getCurrentTime() ?? 0, end: (player.current?.getCurrentTime() ?? 0) + 3 })}>🔁 تكرار جملة (من مكان الفيديو دلوقتي)</button>
      )}

      {loopMoment && player.current && !recording && (
        <LoopPractice
          key={`${loopMoment.start}-${loopMoment.end}`}
          source={ytSource(player.current)}
          moment={loopMoment}
          guides={guides}
          score={(s) => checkScale(s, tonicFreq, scale.pcs, TOLERANCE).percentInScale}
          label={song?.title ?? `يوتيوب ${tonicName(tonicPc).name} ${scale.ar}`}
          songId={song?.id}
          onClose={() => setLoopMoment(null)}
        />
      )}

      {result && sung && !recording && (
        <div className="panel">
          <div className="stats">
            <Stat label="جوه السلم" value={`${result.percentInScale}%`} />
            <Stat label="لحظات برا السلم" value={result.outRanges.length} />
          </div>
          <PitchGraph reference={[]} sung={sung} guides={guides} offRanges={result.outRanges} onSeek={recUrl ? seekRecording : undefined} />
          <p className="legend">
            <span className="swatch sung" /> صوتك <span className="swatch ref" /> القرار <span className="swatch off" /> برا السلم — دوسي على الرسم تسمعي نفسك
          </p>
          {recUrl && <audio ref={recAudio} src={recUrl} controls className="rec" />}
          {recUrl && <SaveRecording url={recUrl} name={'youtube-' + (videoId ?? '')} />}
          {result.outRanges.length > 0 && (
            <ul className="off-list">
              {result.outRanges.map((r, i) => (
                <li key={i} className="off-item">
                  <button onClick={() => seekRecording(r.start)}>
                    <span dir="ltr">
                      {fmtTime(r.start)}–{fmtTime(r.end)}
                    </span>{' '}
                    برا السلم ({r.cents > 0 ? '+' : ''}
                    {r.cents} سنت عن أقرب نغمة)
                  </button>
                  <button className="primary" onClick={() => setLoopMoment({ start: r.start, end: r.end })}>
                    🔁 كرري الحتة دي
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function OfflineNote() {
  return useOnline() ? null : <div className="error">📴 مفيش إنترنت دلوقتي — وضع يوتيوب محتاج إنترنت. وضع "ملف صوت" بيشتغل من غير إنترنت.</div>;
}
