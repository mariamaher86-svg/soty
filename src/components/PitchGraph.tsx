// Timeline graph: reference pitch line, her pitch line (moved to the reference's octave), off ranges,
// and optional scale guide lines (YouTube mode, where there is no reference line).

import { foldToOctaveOf, sampleAt, type PitchPoint } from '../lib/compare';
import { freqToMidi, noteName } from '../lib/music';

const PX_PER_SEC = 40;
const HEIGHT = 220;

interface Props {
  reference: PitchPoint[];
  sung?: PitchPoint[];
  offRanges?: { start: number; end: number }[];
  onSeek?: (t: number) => void;
  /** Scale pitches as fractional MIDI notes (any octave): drawn as faint lines; `tonicPc` ones are labelled. */
  guides?: { midi: number; tonic: boolean }[];
  /** Draw from this time on (for a live, scrolling view). */
  startT?: number;
}

/** Turn a curve into SVG path data, breaking the line at silences. */
function path(points: { t: number; midi: number | null }[], x: (t: number) => number, y: (m: number) => number): string {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (p.midi === null) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.midi).toFixed(1)}`;
    pen = true;
  }
  return d;
}

export function PitchGraph({ reference, sung, offRanges, onSeek, guides, startT = 0 }: Props) {
  const refMidi = reference.map((p) => ({ t: p.t, midi: p.freq ? freqToMidi(p.freq) : null }));
  // Her pitch, shifted by whole octaves to sit on the reference line (comparison ignores octave).
  const sungMidi = (sung ?? []).map((p) => {
    if (!p.freq) return { t: p.t, midi: null };
    const r = sampleAt(reference, p.t, 0.3);
    return { t: p.t, midi: freqToMidi(r?.freq ? foldToOctaveOf(p.freq, r.freq) : p.freq) };
  });
  const all = [...refMidi, ...sungMidi].map((p) => p.midi).filter((m): m is number => m !== null);
  if (!all.length) return <p className="hint">مفيش نغمات واضحة في الملف.</p>;

  const minM = Math.floor(Math.min(...all)) - 2;
  const maxM = Math.ceil(Math.max(...all)) + 2;
  const duration = Math.max(...reference.map((p) => p.t), ...(sung ?? []).map((p) => p.t), startT + 1) - startT;
  const width = Math.ceil(duration * PX_PER_SEC) + 40;
  const x = (t: number) => 40 + (t - startT) * PX_PER_SEC;
  const y = (m: number) => HEIGHT - 10 - ((m - minM) / (maxM - minM)) * (HEIGHT - 20);

  const gridNotes: number[] = [];
  for (let m = Math.ceil(minM); m <= maxM; m++) if (m % 12 === 0 || m % 12 === 7) gridNotes.push(m); // C and G lines

  return (
    <div className="graph-scroll" dir="ltr">
      <svg
        width={width}
        height={HEIGHT}
        className="graph"
        onClick={(e) => {
          if (!onSeek) return;
          const box = e.currentTarget.getBoundingClientRect();
          onSeek(Math.max(0, startT + (e.clientX - box.left - 40) / PX_PER_SEC));
        }}
      >
        {(offRanges ?? []).map((r, i) => (
          <rect key={i} className="graph-off" x={x(r.start)} y={0} width={Math.max(2, (r.end - r.start) * PX_PER_SEC)} height={HEIGHT} />
        ))}
        {(guides ?? [])
          .filter((g) => g.midi >= minM && g.midi <= maxM)
          .map((g) => (
            <g key={'g' + g.midi}>
              <line className={g.tonic ? 'graph-tonic' : 'graph-guide'} x1={40} x2={width} y1={y(g.midi)} y2={y(g.midi)} />
              {g.tonic && (
                <text className="graph-label" x={2} y={y(g.midi) + 4}>
                  {noteName(g.midi)}
                </text>
              )}
            </g>
          ))}
        {!guides && gridNotes.map((m) => (
          <g key={m}>
            <line className="graph-grid" x1={40} x2={width} y1={y(m)} y2={y(m)} />
            <text className="graph-label" x={2} y={y(m) + 4}>
              {noteName(m)}
            </text>
          </g>
        ))}
        {Array.from({ length: Math.floor(duration / 5) + 2 }, (_, i) => Math.ceil(startT / 5) * 5 + i * 5).filter((s) => s - startT <= duration).map((s) => (
          <text key={s} className="graph-label" x={x(s)} y={HEIGHT - 1}>
            {s}s
          </text>
        ))}
        {reference.length > 0 && <path className="graph-ref" d={path(refMidi, x, y)} />}
        {sung && <path className="graph-sung" d={path(sungMidi, x, y)} />}
      </svg>
    </div>
  );
}
