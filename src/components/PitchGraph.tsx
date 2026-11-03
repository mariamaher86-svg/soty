// Timeline graph: reference pitch line, her pitch line (moved to the reference's octave), off ranges,
// and optional scale guide lines (YouTube mode, where there is no reference line).

import { memo, useMemo } from 'react';
import { foldToOctaveOf, sampleAt, type PitchPoint } from '../lib/compare';
import { minMax, thinPoints } from '../lib/curveCap';
import { freqToMidi, noteName } from '../lib/music';

const PX_PER_SEC = 40;
const HEIGHT = 220;
/** Points in one line, and the graph's width: a long song stays light to draw and to keep on screen. */
const MAX_POINTS = 2000;
const MAX_WIDTH = 4000;

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

/** Redrawn only when its data changes (not on every live reading of the page around it). */
export const PitchGraph = memo(function PitchGraph({ reference, sung, offRanges, onSeek, guides, startT = 0 }: Props) {
  const drawn = useMemo(() => {
    const refMidi = thinPoints(reference, MAX_POINTS).map((p) => ({ t: p.t, midi: p.freq ? freqToMidi(p.freq) : null }));
    // Her pitch, shifted by whole octaves to sit on the reference line (comparison ignores octave).
    const sungMidi = thinPoints(sung ?? [], MAX_POINTS).map((p) => {
      if (!p.freq) return { t: p.t, midi: null };
      const r = sampleAt(reference, p.t, 0.3);
      return { t: p.t, midi: freqToMidi(r?.freq ? foldToOctaveOf(p.freq, r.freq) : p.freq) };
    });
    const range = minMax([...refMidi, ...sungMidi].flatMap((p) => (p.midi === null ? [] : [p.midi])));
    if (!range) return null;
    const minM = Math.floor(range.min) - 2;
    const maxM = Math.ceil(range.max) + 2;
    const lastT = Math.max(reference[reference.length - 1]?.t ?? 0, minMax((sung ?? []).map((p) => p.t))?.max ?? 0, startT + 1);
    const duration = lastT - startT;
    const pxPerSec = Math.min(PX_PER_SEC, MAX_WIDTH / Math.max(duration, 1));
    const x = (t: number) => 40 + (t - startT) * pxPerSec;
    const y = (m: number) => HEIGHT - 10 - ((m - minM) / (maxM - minM)) * (HEIGHT - 20);
    return { minM, maxM, duration, pxPerSec, width: Math.ceil(duration * pxPerSec) + 40, x, y, refPath: path(refMidi, x, y), sungPath: path(sungMidi, x, y) };
  }, [reference, sung, startT]);
  if (!drawn) return <p className="hint">مفيش نغمات واضحة في الملف.</p>;
  const { minM, maxM, duration, pxPerSec, width, x, y, refPath, sungPath } = drawn;

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
          onSeek(Math.max(0, startT + (e.clientX - box.left - 40) / pxPerSec));
        }}
      >
        {(offRanges ?? []).map((r, i) => (
          <rect key={i} className="graph-off" x={x(r.start)} y={0} width={Math.max(2, (r.end - r.start) * pxPerSec)} height={HEIGHT} />
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
        {reference.length > 0 && <path className="graph-ref" d={refPath} />}
        {sung && <path className="graph-sung" d={sungPath} />}
      </svg>
    </div>
  );
});
