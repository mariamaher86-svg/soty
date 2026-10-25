// Downloads the sample sets once into public/samples so the app works offline.
// Run: npm run fetch-samples
//  - Piano: Salamander Grand Piano V3 by Alexander Holm, CC-BY 3.0 (files via the Tone.js audio repo)
//  - Choir "Aah": FluidR3_GM soundfont by Frank Wen, CC-BY 3.0 (files via gleitz/midi-js-soundfonts)
import { mkdir, writeFile } from 'node:fs/promises';

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SALAMANDER = { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' }; // Salamander has every minor third
const octave = (m) => Math.floor(m / 12) - 1;
const range = (from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const SETS = {
  // C2..C7 every 3 semitones
  piano: { notes: range(36, 96, 3), url: (m) => `https://tonejs.github.io/audio/salamander/${SALAMANDER[m % 12]}${octave(m)}.mp3` },
  // C2..C6 every 3 semitones
  choir: { notes: range(36, 84, 3), url: (m) => `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/choir_aahs-mp3/${NAMES[m % 12]}${octave(m)}.mp3` },
};

const manifest = {};
for (const [name, set] of Object.entries(SETS)) {
  const dir = new URL(`../public/samples/${name}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  manifest[name] = [];
  for (const m of set.notes) {
    const res = await fetch(set.url(m));
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('audio')) {
      console.warn(`skip ${name} ${m}: ${res.status} ${type}`);
      continue;
    }
    await writeFile(new URL(`${m}.mp3`, dir), Buffer.from(await res.arrayBuffer()));
    manifest[name].push(m);
    process.stdout.write('.');
  }
  console.log(` ${name}: ${manifest[name].length} files`);
}
await writeFile(new URL('../public/samples/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log('done');
