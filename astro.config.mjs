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

/**
 * Two hosts, one build.
 *
 * GitHub Pages serves this out of a project subpath, so `base` has to be
 * /ahmad-assi-portfolio there. Netlify serves it from the root of its own
 * domain, where that same prefix would make every stylesheet, script and image
 * 404 while the page itself still loaded, which looks like a broken site rather
 * than a misconfigured one.
 *
 * Netlify sets NETLIFY and URL during a build, so the right pair is chosen
 * automatically and neither host needs the config edited by hand. Everything
 * internal goes through src/lib/url.ts, which handles a root base correctly.
 *
 * For a custom domain on Netlify, nothing here changes: Netlify updates URL to
 * the domain once it is attached. On Pages, set `site` to the domain and `base`
 * to '/'.
 */
const onNetlify = process.env.NETLIFY === 'true';

export default defineConfig({
  site: onNetlify
    ? process.env.URL || 'https://ahmad-assi.netlify.app'
    : 'https://hassantfaili-ui.github.io',
  base: onNetlify ? '/' : '/ahmad-assi-portfolio',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
  integrations: editing ? [react(), keystatic()] : [],
});
