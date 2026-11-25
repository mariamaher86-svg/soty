// Two kinds of tests: pure logic (*.test.ts, Node) and pages/components clicked like a user (*.test.tsx, jsdom with
// the fakes in src/test). `npm test` runs both; `npm run coverage` also measures coverage.

import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // At most 8 test files at once. Vitest's default (all cores but one: 21 here) made the page tests fight for the CPU:
    // the same test took 0.8 s alone and 9–14 s in the suite, so a second suite or a build running alongside pushed
    // tests past their time limit. 8 workers run the whole suite faster, and every test stays far from its limit.
    // Smaller machines (CI: 4 cores) keep the default.
    maxWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'pages', include: ['src/**/*.test.tsx'], environment: 'jsdom', setupFiles: ['src/test/setup.ts'], testTimeout: 20000 } },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/config/**'],
      reporter: ['text-summary', 'json-summary', 'text'],
    },
  },
});
