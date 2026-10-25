import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { precacheList, precacheVersion, serviceWorkerSource } from './src/lib/precache';

/** After the build: write dist/sw.js that precaches every built file (app shell, assets, sound samples). */
function offline(): Plugin {
  let outDir = 'dist';
  return {
    name: 'soty-offline',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [relative(outDir, join(d, f))]));
      const list = precacheList(walk(outDir));
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(list, precacheVersion(list, String(Date.now()))));
    },
  };
}

// `npm run dev:phone` uses mode "phone": serves on the local network over HTTPS
// (a self-signed certificate) so the phone's browser allows the microphone.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), offline(), ...(mode === 'phone' ? [basicSsl()] : [])],
}));
