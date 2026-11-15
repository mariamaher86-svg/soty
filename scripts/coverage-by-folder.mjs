// After `npm run coverage`: statements and branches per folder, and the least-covered files.
import { readFileSync } from 'node:fs';

const sum = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const folders = {};
const files = [];
for (const [file, v] of Object.entries(sum)) {
  if (file === 'total') continue;
  const rel = file.split(String.fromCharCode(92)).join('/').replace(/^.*\/src\//, 'src/');
  const dir = rel.split('/').slice(0, 2).join('/');
  const f = (folders[dir] ??= { s: [0, 0], b: [0, 0] });
  f.s[0] += v.statements.covered;
  f.s[1] += v.statements.total;
  f.b[0] += v.branches.covered;
  f.b[1] += v.branches.total;
  files.push({ rel, s: v.statements.pct, b: v.branches.pct, n: v.statements.total });
}
const pct = ([c, t]) => (t ? ((100 * c) / t).toFixed(1) : '100.0');
console.log('folder'.padEnd(18), 'statements', 'branches');
for (const [d, f] of Object.entries(folders).sort()) console.log(d.padEnd(18), pct(f.s).padStart(9) + '%', pct(f.b).padStart(8) + '%');
console.log('total'.padEnd(18), String(sum.total.statements.pct).padStart(9) + '%', String(sum.total.branches.pct).padStart(8) + '%');
console.log('\nleast covered files (statements):');
for (const x of files.filter((x) => x.n > 10).sort((a, b) => a.s - b.s).slice(0, 15)) console.log(`  ${x.s}%  ${x.rel}`);
