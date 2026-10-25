import { useEffect, useRef, useState } from 'react';
import { ErrorText, Options, Page, Stat } from '../components/ui';
import { micErrorMessage, startMic, type Mic } from '../audio/audio';
import { playNote } from '../audio/sound';
import { courseLength, courseScore, GAME_LEVELS, gatePoints, inGate, makeCourse, midiToY, stepBird, type Gate } from '../lib/game';
import { freqToMidi, midiToFreq } from '../lib/music';
import { inUserOctave } from '../lib/voice';
import { addResult, getPref, setPref } from '../lib/storage';
import { exerciseRange } from './common';

const HEIGHT = 340;
const BIRD_X = 70;
const HOLD_MS = 150; // keep the last pitch this long through tiny dropouts

const bestOf = (level: number) => Number(getPref('game.best.' + level) ?? 0) || 0;

type Phase = 'idle' | 'play' | 'pause' | 'done';

/** "🎮 لعبة الصوت": a canvas bird that follows her pitch through gates. */
export function GamePage() {
  const range = useRef(exerciseRange()).current;
  const [level, setLevel] = useState<1 | 2 | 3>(() => (Number(getPref('game.level')) as 1 | 2 | 3) || 1);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<{ points: number; percent: number; best: boolean } | null>(null);
  const [hints, setHints] = useState(() => getPref('game.hints') !== '0');
  const [err, setErr] = useState('');
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const game = useRef({
    gates: [] as Gate[],
    inside: new Float64Array(0),
    played: new Uint8Array(0),
    next: 0,
    y: HEIGHT * 0.8,
    t: 0, // course time, s
    last: 0, // performance.now of the last frame
    midi: null as number | null,
    midiAt: 0,
    raf: 0,
    mic: null as Mic | null,
    scoreText: '0',
    points: 0,
    shown: 0,
    end: 0,
    flap: 0,
  });
  const reduced = useRef(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches).current;
  const lvl = GAME_LEVELS.find((l) => l.id === level)!;
  const low = range.low - 1;
  const high = range.high + 1;

  const stopAll = () => {
    const g = game.current;
    cancelAnimationFrame(g.raf);
    g.raf = 0;
    g.mic?.stop();
    g.mic = null;
  };
  useEffect(() => stopAll, []);

  // pause when she leaves the app
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && phaseRef.current === 'play') pause();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const finish = () => {
    const g = game.current;
    stopAll();
    const pts: number[] = [];
    for (let i = 0; i < g.gates.length; i++) pts.push(gatePoints(g.inside[i], g.gates[i].dur));
    const s = courseScore(pts);
    const best = s.points > bestOf(level);
    if (best) setPref('game.best.' + level, String(s.points));
    addResult('game', s.points, `${lvl.ar} — ${s.percent}%`);
    setResult({ ...s, best });
    setPhase('done');
  };

  const draw = (now: number) => {
    const g = game.current;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dt = Math.min(0.05, (now - g.last) / 1000);
    g.last = now;
    g.t += dt;
    const voiced = g.midi !== null && now - g.midiAt < HOLD_MS ? g.midi : null;
    g.y = stepBird(g.y, voiced === null ? null : midiToY(voiced, low, high, HEIGHT), dt, HEIGHT);

    // gates: score the active one, close finished ones, play the next note a moment before it arrives
    while (g.next < g.gates.length && g.t > g.gates[g.next].t + g.gates[g.next].dur) g.next++;
    const cur = g.gates[g.next];
    if (cur && g.t >= cur.t && inGate(voiced, cur.midi, lvl.tolerance)) {
      g.inside[g.next] += dt;
      g.points += dt * (100 / cur.dur);
      const shown = Math.round(g.points);
      if (shown !== g.shown) {
        g.shown = shown;
        g.scoreText = String(shown);
      }
    }
    if (hintsRef.current)
      for (let i = g.next; i < g.gates.length && g.gates[i].t - g.t < 1.4; i++)
        if (!g.played[i] && g.gates[i].t - g.t <= 1.2) {
          g.played[i] = 1;
          void playNote(midiToFreq(g.gates[i].midi), 0.7);
        }

    // draw (no allocations: plain numbers and cached strings)
    const w = c.width / devicePixelRatio;
    const css = colors.current;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = css.bg;
    ctx.fillRect(0, 0, w, HEIGHT);
    ctx.fillStyle = css.ground;
    ctx.fillRect(0, HEIGHT * 0.95, w, HEIGHT * 0.05);
    for (let i = g.next; i < g.gates.length; i++) {
      const gate = g.gates[i];
      const x = BIRD_X + (gate.t - g.t) * lvl.speed;
      if (x > w) break;
      const top = midiToY(gate.midi + lvl.tolerance / 100, low, high, HEIGHT);
      const bottom = midiToY(gate.midi - lvl.tolerance / 100, low, high, HEIGHT);
      ctx.fillStyle = i === g.next && g.inside[i] > 0 ? css.ok : css.gate;
      ctx.fillRect(x, top, gate.dur * lvl.speed, Math.max(6, bottom - top));
    }
    if (!reduced) g.flap = (g.flap + dt * 6) % 2;
    ctx.fillStyle = voiced === null ? css.muted : css.accent;
    ctx.beginPath();
    ctx.arc(BIRD_X, g.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(BIRD_X - 20, g.y - (g.flap < 1 ? 6 : -2), 12, 4); // wing
    ctx.fillStyle = css.text;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(g.scoreText, w - 60, 30);

    if (g.t >= g.end) return finish();
    g.raf = requestAnimationFrame(draw);
  };
  const hintsRef = useRef(hints);
  hintsRef.current = hints;
  const colors = useRef({ bg: '#fff', ground: '#ccc', gate: '#ddd', ok: '#1f9d55', accent: '#6d4bd8', muted: '#999', text: '#000' });

  const sizeCanvas = () => {
    const c = canvas.current;
    if (!c) return;
    const w = c.parentElement?.clientWidth ?? 360;
    c.width = Math.round(w * devicePixelRatio);
    c.height = Math.round(HEIGHT * devicePixelRatio);
    c.style.width = w + 'px';
    c.style.height = HEIGHT + 'px';
    const s = getComputedStyle(document.documentElement);
    const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d;
    colors.current = { bg: v('--surface', '#fff'), ground: v('--border', '#ccc'), gate: v('--accent-soft', '#ddd'), ok: v('--ok', '#1f9d55'), accent: v('--accent', '#6d4bd8'), muted: v('--muted', '#999'), text: v('--text', '#000') };
  };

  useEffect(() => {
    const onResize = () => sizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startMicFor = async () => {
    try {
      game.current.mic = await startMic((f) => {
        if (f.freq) {
          game.current.midi = freqToMidi(f.freq);
          game.current.midiAt = performance.now();
        }
      }, 0.85);
      return true;
    } catch (e) {
      setErr(micErrorMessage(e));
      return false;
    }
  };

  const start = async () => {
    setErr('');
    setResult(null);
    if (!(await startMicFor())) return;
    const g = game.current;
    const tonic = inUserOctave(60, range.low, range.high - 12 >= range.low ? range.high - 12 : range.high);
    g.gates = makeCourse(level, range.low, range.high, tonic, Date.now() % 100000);
    g.inside = new Float64Array(g.gates.length);
    g.played = new Uint8Array(g.gates.length);
    g.next = 0;
    g.t = 0;
    g.points = 0;
    g.shown = 0;
    g.scoreText = '0';
    g.y = HEIGHT * 0.8;
    g.end = courseLength(g.gates);
    sizeCanvas();
    setPhase('play');
    g.last = performance.now();
    g.raf = requestAnimationFrame(draw);
  };

  const pause = () => {
    const g = game.current;
    cancelAnimationFrame(g.raf);
    g.raf = 0;
    g.mic?.stop();
    g.mic = null;
    setPhase('pause');
  };

  const resume = async () => {
    if (!(await startMicFor())) return;
    const g = game.current;
    g.last = performance.now();
    setPhase('play');
    g.raf = requestAnimationFrame(draw);
  };

  return (
    <Page tips help="game" title="🎮 لعبة الصوت" intro="العصفورة بتطلع وتنزل مع صوتك: غني أعلى تطلع، أوطى تنزل. دخّليها جوه البوابات. لو سكتي بتنزل بالراحة — مفيش خسارة.">
      <div className="panel">
        <div className="choices">
          {GAME_LEVELS.map((l) => (
            <button
              key={l.id}
              className={l.id === level ? 'chip active' : 'chip'}
              disabled={phase === 'play' || phase === 'pause'}
              onClick={() => {
                setLevel(l.id);
                setPref('game.level', String(l.id));
              }}
            >
              {l.id}. {l.ar}
            </button>
          ))}
        </div>
        <Options>
        <label className="check-row">
          <input
            type="checkbox"
            checked={hints}
            onChange={(e) => {
              setHints(e.target.checked);
              setPref('game.hints', e.target.checked ? '1' : '0');
            }}
          />
          🔊 اسمعي النغمة قبل كل بوابة
        </label>
        </Options>
        <Stat label="أعلى نتيجة في المستوى ده" value={bestOf(level) || '—'} />
      </div>
      <div className="game-wrap">
        <canvas ref={canvas} className="game-canvas" aria-label="لعبة الصوت: العصفورة والبوابات" />
        {phase === 'idle' && <p className="game-overlay">دوسي «▶️ ابدئي اللعب» تحت.</p>}
        {phase === 'pause' && <p className="game-overlay">⏸ واقفة</p>}
      </div>
      <div className="row">
        {(phase === 'idle' || phase === 'done') && (
          <button className="big primary" onClick={start}>
            {phase === 'done' ? '🔁 العبي تاني' : '▶️ ابدئي اللعب'}
          </button>
        )}
        {phase === 'play' && (
          <button className="big" onClick={pause}>
            ⏸ وقفي
          </button>
        )}
        {phase === 'pause' && (
          <>
            <button className="big primary" onClick={resume}>
              ▶️ كمّلي
            </button>
            <button
              onClick={() => {
                stopAll();
                setPhase('idle');
              }}
            >
              خلاص
            </button>
          </>
        )}
      </div>
      <ErrorText text={err} />
      {result && (
        <div className="panel center">
          <Stat label="النقط" value={result.points} />
          <p>جوه البوابات {result.percent}% من الوقت.</p>
          {result.best && <p className="ok-text">🏆 أعلى نتيجة ليكي في المستوى ده!</p>}
        </div>
      )}
    </Page>
  );
}
