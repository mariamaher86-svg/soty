// A small one-octave piano (C to the next C) with some keys highlighted, for the lessons.

const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
const WHITE_AR = ['دو', 'ري', 'مي', 'فا', 'صول', 'لا', 'سي', 'دو'];
const BLACK = [1, 3, 6, 8, 10];

export function Keyboard({ highlight }: { highlight: number[] }) {
  const W = 40;
  const H = 120;
  const on = new Set(highlight);
  const x = (semi: number) => WHITE.indexOf(semi) * W;
  return (
    <svg className="keyboard" viewBox={`0 0 ${W * 8} ${H}`} role="img" aria-label="رسم بيانو" style={{ direction: 'ltr' }}>
      {WHITE.map((s, i) => (
        <g key={'w' + s + i}>
          <rect className={on.has(s) ? 'key white on' : 'key white'} x={x(s)} y={0} width={W} height={H} rx={4} />
          <text className="key-label" x={x(s) + W / 2} y={H - 10} textAnchor="middle">
            {WHITE_AR[i]}
          </text>
        </g>
      ))}
      {BLACK.map((s) => (
        <rect key={'b' + s} className={on.has(s) ? 'key black on' : 'key black'} x={x(s - 1) + W * 0.68} y={0} width={W * 0.64} height={H * 0.6} rx={3} />
      ))}
    </svg>
  );
}
