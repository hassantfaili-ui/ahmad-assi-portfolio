import { defineConfig } from 'astro/config';
import tina from '@tinacms/astro/integration';
import { tinaAdminDevRedirect } from '@tinacms/astro/vite';
import cloudflare from '@astrojs/cloudflare';
import shrinkMedia from './src/integrations/shrink-media.mjs';

/**
 * The editor.
 *
 * TinaCMS, at /admin, replacing Keystatic. The reason for the change was not
 * that Keystatic was broken; it worked. It was that editing there happened in a
 * form on a screen that looked nothing like the website, so every change was
 * type, save, wait, go and look. Tina renders the real page next to the fields:
 * Ahmad clicks the heading on the page to open the field that writes it, and
 * the page changes as he types.
 *
 * `output: 'static'` is unchanged and every page of the site is still a plain
 * file. The editor needs exactly one route that is not: /tina-island, which
 * renders a fragment of a page from unsaved values while somebody is editing.
 * The Cloudflare adapter is what gives that route somewhere to run.
 *
 * That route uses AsyncLocalStorage, so the Worker needs `nodejs_compat`. It is
 * set in wrangler.jsonc; without it the deploy builds and the editor's live
 * preview 500s, which is a confusing way to find out.
 */

/**
 * Served from the root of its own domain.
 *
 * This used to switch between a root base for Netlify and a /ahmad-assi-portfolio
 * subpath for GitHub Pages. Pages is retired, and keeping the subpath for a host
 * nothing deploys to had a cost: an admin UI routes itself from the site root,
 * so under a base path it loaded its shell and then 404'd on every screen inside.
 *
 * Everything internal still goes through src/lib/url.ts. It is a passthrough at
 * a root base, and it is what would make a subpath host work again if one is ever
 * needed, without touching a single link or asset path.
 *
 * A custom domain needs no change here: Cloudflare Pages updates CF_PAGES_URL
 * once it is attached.
 */
export default defineConfig({
  /* Cloudflare Pages publishes the deploy URL as CF_PAGES_URL. URL is kept as a
     fallback so a Netlify build, or a local `netlify dev`, still resolves. */
  site: process.env.CF_PAGES_URL || process.env.URL || 'https://ahmadassi.ca',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
  /* Always on, deliberately. It used to be conditional, on the reasoning that a
     site with no editor needs no server. That produced two different build
     shapes from one repository, and the deploy command only suits one of them:
     `wrangler deploy` wants a worker, and a build without the adapter emits
     none, so it failed looking for dist/server/wrangler.json. One shape every
     time is worth more than skipping a worker that costs nothing when idle and
     that Cloudflare serves static assets around for free either way. */
  adapter: cloudflare(),
  /* shrink-media runs on every build, editor or not. It is the backstop that
     keeps an oversized upload from reaching a visitor, so it must not be
     conditional on the thing that lets uploads happen. */
  integrations: [tina(), shrinkMedia()],
  vite: {
    /* `astro dev` serves public/admin straight from disk and will not resolve a
       directory index for it, so a bare /admin 404s without this. A built site
       serves the index itself and the plugin does not apply. */
    plugins: [tinaAdminDevRedirect()],
    /* Bundle Tina's Astro package into the server build rather than resolving it
       per module on every cold request. Left external, the first edit of a
       session pays for a full Vite resolve and compile of the package's own
       .astro files before it renders anything. */
    ssr: { noExternal: ['@tinacms/astro', '@tinacms/bridge'] },
  },
});
