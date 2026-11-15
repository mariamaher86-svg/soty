// Two kinds of tests: pure logic (*.test.ts, Node) and pages/components clicked like a user (*.test.tsx, jsdom with
// the fakes in src/test). `npm test` runs both; `npm run coverage` also measures coverage.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
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
