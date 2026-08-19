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
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
