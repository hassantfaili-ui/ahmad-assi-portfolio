import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  esbuild: {
    /* The automatic runtime, so a component test does not have to import React
       just to satisfy the transform. Vitest's own esbuild pass handles JSX;
       @vitejs/plugin-react is not installed because it pins a different vite
       major than vitest brings. */
    jsx: 'automatic',
  },
  test: {
    /* node by default, since most of what is tested here is pure logic and a
       DOM would only slow it down. A component test opts in with a docblock:
       @vitest-environment jsdom
       That matters more than it sounds: with no DOM environment available at
       all, no component could be mounted, which is how a hydration mismatch in
       the editing screens got past every gate. */
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],

    /* The default is 5s, and mounting the whole editing screen and typing into
       it with real key events takes a third of that on an idle laptop. A CI
       runner is slower and shares its cores, so the margin disappears and the
       suite starts failing for want of time rather than for a defect, which is
       the least useful kind of red there is.
       This does not hide a broken save: an assertion that never comes true
       fails on waitFor's own timeout with a real message, long before this. */
    testTimeout: 20_000,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
