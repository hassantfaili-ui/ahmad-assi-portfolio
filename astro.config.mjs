import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';

/**
 * Keystatic's admin UI needs server rendered routes, which a purely static
 * build cannot produce. So it is mounted during `npm run dev` only: Ahmad edits
 * content at http://localhost:4321/keystatic, and `npm run build` stays fully
 * static with nothing to host but files.
 *
 * To put the editor online later, add the host's adapter and include
 * keystatic() unconditionally with storage set to GitHub mode. That step needs
 * Ahmad's own GitHub account, so it is deliberately left for him.
 */
const editing = process.env.npm_lifecycle_event === 'dev';

export default defineConfig({
  site: 'https://ahmadassi.ca',
  output: 'static',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
  integrations: editing ? [react(), keystatic()] : [],
});
