import { useEffect, useRef, useState } from 'react';
import { ErrorText, LiveNote, Page } from '../components/ui';
import { useMic } from '../audio/useMic';
import { audioContext } from '../audio/audio';
import { playNote } from '../audio/sound';
import { deleteTeacher, listTeacher, onTeacherChange, saveTeacher, type TeacherNote } from '../audio/teacherStore';
import { midiToFreq, nearestNote, noteName, noteNameAr } from '../lib/music';
import { extractPitchCurve, toMono } from '../lib/pitchTrack';
import { steadySegment, trimWithFades } from '../lib/samples';
import { assessRecording, checkTake, syllableTargets, takeMessage } from '../lib/teacherCheck';
import { exerciseRange } from './common';

const RECORD_SECONDS = 3.5;

/** Notes to aim for: every 4 semitones across the exercise range (≈3 per octave/register). */
function suggestedNotes(): number[] {
  const r = exerciseRange();
  const out: number[] = [];
  for (let m = r.low - 2; m <= r.high + 2; m += 4) out.push(m);
  return out;
}

type Target = { midi: number; syllable?: string; ar?: string };

export function TeacherPage() {
  const [mode, setMode] = useState<'notes' | 'syllables'>('notes');
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState<'' | 'recording' | 'analysing'>('');
  const [left, setLeft] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [checks, setChecks] = useState<Record<number, string>>({});
  const range = useRef(exerciseRange()).current;
  const suggestions = useRef(suggestedNotes()).current;
  const syllables = useRef(syllableTargets(range.low, range.high)).current;
  const { frame, error, start, stop } = useMic();

  useEffect(() => {
    const refresh = () => void listTeacher().then(setNotes);
    refresh();
    return onTeacherChange(refresh);
  }, []);

  const choose = (t: Target) => {
    setTarget(t);
    setMsg('');
    setErr('');
    void playNote(midiToFreq(t.midi), 1.5, 'piano');
  };

  /** Record a take for the chosen note; it's saved only if it's steady and within ±30 cents. */
  const record = async (t: Target, replaceId?: number) => {
    setMsg('');
    setErr('');
    const mic = await start();
    if (!mic) return;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(mic.stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    setBusy('recording');
    rec.start();
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = setInterval(() => {
        const l = RECORD_SECONDS - (performance.now() - t0) / 1000;
        setLeft(Math.max(0, l));
        if (l <= 0) {
          clearInterval(tick);
          resolve();
        }
      }, 100);
    });
    rec.stop();
    await stopped;
    stop();
    setBusy('analysing');
    try {
      const buf = await audioContext().decodeAudioData(await new Blob(chunks, { type: rec.mimeType }).arrayBuffer());
      const mono = toMono(buf);
      const seg = steadySegment(await extractPitchCurve(mono, buf.sampleRate), 40, 0.6);
      const check = checkTake(seg, t.midi);
      if (!check.ok || !seg) setErr(takeMessage(check));
      else {
        const ok = await saveTeacher({ freq: seg.freq, sampleRate: buf.sampleRate, data: trimWithFades(mono, buf.sampleRate, seg.start, seg.end), createdAt: Date.now(), target: t.midi, syllable: t.syllable });
        if (!ok) setErr('معرفناش نحفظ التسجيل في المتصفح ده (ممكن يكون وضع التصفح الخاص).');
        else {
          // a new good take replaces the old one for the same syllable / same note
          const old = replaceId ?? notes.find((n) => (t.syllable ? n.syllable === t.syllable : !n.syllable && n.target === t.midi))?.id;
          if (old !== undefined) await deleteTeacher(old);
          setMsg(`${t.ar ?? noteName(t.midi)}: ${takeMessage(check)}`);
        }
      }
    } catch (e) {
      setErr('حصلت مشكلة في قراءة التسجيل: ' + String(e));
    }
    setBusy('');
  };

  /** Re-check a saved recording (pitch against its note, steadiness). */
  const recheck = async (n: TeacherNote) => {
    if (n.id === undefined) return;
    const a = assessRecording(await extractPitchCurve(n.data, n.sampleRate), n.target);
    setChecks((c) => ({
      ...c,
      [n.id!]:
        a.cents === null
          ? '⚠ مفيش نغمة واضحة'
          : `${a.ok ? '✔ مظبوطة' : '⚠ محتاجة تتسجل تاني'} — ${a.cents > 0 ? '+' : ''}${a.cents} سنت${n.target !== undefined ? ' عن النغمة' : ' عن أقرب نغمة'}، اهتزاز ${a.steadiness} سنت`,
    }));
  };

  const recorded = (t: Target) => notes.find((n) => (t.syllable ? n.syllable === t.syllable : !n.syllable && n.target !== undefined && Math.abs(n.target - t.midi) < 0.5));
  const voiceNotes = notes.filter((n) => !n.syllable);
  const sylNotes = notes.filter((n) => n.syllable);

  return (
    <Page
      tips
      mic
      help="teacher"
      title="تسجيل صوت المعلم"
      intro="أي حد صوته حلو (مدرّس أو مدرّسة) بيسجّل نغمات ثابتة. كل تسجيل بيتفحص: لازم يكون ثابت وفي حدود ±٣٠ سنت من النغمة، وإلا مش بيتحفظ."
    >
      <div className="choices">
        <button className={mode === 'notes' ? 'chip active' : 'chip'} onClick={() => {
            setMode('notes');
            setTarget(null);
          }}>
          🎵 نغمات "آآه"
        </button>
        <button className={mode === 'syllables' ? 'chip active' : 'chip'} onClick={() => {
            setMode('syllables');
            setTarget(null);
          }}>
          🗣️ دو ري مي
        </button>
      </div>
      <ErrorText text={error} />

      {mode === 'notes' ? (
        <div className="panel">
          <h2>١. اختيار النغمة</h2>
          <p className="hint">الضغط على النغمة بيختارها ويشغّلها على البيانو. حوالي ٣ نغمات في كل منطقة (تحت، نص، فوق) كفاية. التسجيلات دي بتتسمع لما "صوت" يكون مختار في التمارين.</p>
          <div className="choices">
            {suggestions.map((m) => (
              <button key={m} className={target?.midi === m ? 'chip active' : recorded({ midi: m }) ? 'chip done' : 'chip'} disabled={!!busy} onClick={() => choose({ midi: m })}>
                {recorded({ midi: m }) ? '✔ ' : ''}
                <span dir="ltr">{noteName(m)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel">
          <h2>١. اختيار المقطع</h2>
          <p className="hint">كل مقطع بيتسجّل على نغمته بالظبط: "دووو" على دو، "رييي" على ري… وبعدها "🗣️ صوت بيقول النغمة" في التمارين بيقول اسم كل نغمة بالصوت ده.</p>
          <div className="choices">
            {syllables.map((s) => (
              <button key={s.syl} className={target?.syllable === s.syl ? 'chip active' : recorded({ midi: s.midi, syllable: s.syl }) ? 'chip done' : 'chip'} disabled={!!busy} onClick={() => choose({ midi: s.midi, syllable: s.syl, ar: s.ar })}>
                {recorded({ midi: s.midi, syllable: s.syl }) ? '✔ ' : ''}
                {s.ar} <span dir="ltr">({noteName(s.midi)})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel center">
        <h2>٢. التسجيل</h2>
        {!target ? (
          <p className="hint">اختيار {mode === 'notes' ? 'نغمة' : 'مقطع'} من فوق الأول.</p>
        ) : busy === 'recording' ? (
          <>
            <p className="guide">
              دلوقتي: {target.ar ? `"${target.ar}" ممدودة` : 'نغمة واحدة "آآه" ممدودة'} على <span dir="ltr">{noteName(target.midi)}</span>…
            </p>
            <LiveNote freq={frame?.freq ?? null} />
            <div className="timer">{left.toFixed(1)}</div>
          </>
        ) : busy === 'analysing' ? (
          <p className="hint">بنفحص التسجيل…</p>
        ) : (
          <>
            <p>
              النغمة: <b dir="ltr">{noteName(target.midi)}</b> ({noteNameAr(target.midi)}){target.ar ? ` — المقطع: "${target.ar}"` : ''}
            </p>
            <div className="row">
              <button onClick={() => playNote(midiToFreq(target.midi), 1.5, 'piano')}>🔊 سماع النغمة</button>
              <button className="big primary" onClick={() => record(target)}>
                🎙️ تسجيل نغمة
              </button>
            </div>
          </>
        )}
        {msg && <p className="ok-text">{msg}</p>}
        {err && <p className="error">{err}</p>}
      </div>

      {(mode === 'notes' ? voiceNotes : sylNotes).length > 0 && (
        <div className="panel">
          <h2>المتسجل ({(mode === 'notes' ? voiceNotes : sylNotes).length})</h2>
          <ul className="teacher-list">
            {(mode === 'notes' ? voiceNotes : sylNotes).map((n) => {
              const { midi, cents } = nearestNote(n.freq);
              const t: Target = { midi: n.target ?? midi, syllable: n.syllable, ar: syllables.find((s) => s.syl === n.syllable)?.ar };
              return (
                <li key={n.id}>
                  <span>
                    {t.ar ? <b>"{t.ar}" </b> : null}
                    <b dir="ltr">{noteName(midi)}</b> {noteNameAr(midi)}{' '}
                    <small className="hint">
                      ({cents > 0 ? '+' : ''}
                      {Math.round(cents)}¢، {(n.data.length / n.sampleRate).toFixed(1)} ث){n.target === undefined ? ' — اتسجلت قبل الفحص' : ''}
                    </small>
                    {n.id !== undefined && checks[n.id] && <small className="hint check-line">{checks[n.id]}</small>}
                  </span>
                  <span className="row">
                    <button disabled={!!busy} onClick={() => playNote(n.freq, 1.5, n.syllable ? 'syllable' : 'voice')} aria-label="سماع التسجيل">
                      🔊
                    </button>
                    <button disabled={!!busy} onClick={() => recheck(n)}>
                      فحص
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() => {
                        setTarget(t);
                        void record(t, n.id);
                      }}
                    >
                      تسجيل تاني
                    </button>
                    <button disabled={!!busy} className="danger" onClick={() => n.id !== undefined && deleteTeacher(n.id)}>
                      مسح
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="hint">التسجيلات محفوظة على المتصفح ده بس (وبتدخل في النسخة الاحتياطية).</p>
        </div>
      )}
    </Page>
  );
}
