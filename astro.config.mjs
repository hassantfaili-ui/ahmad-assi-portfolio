import { defineConfig } from 'astro/config';
import tina from '@tinacms/astro/integration';
import { tinaAdminDevRedirect } from '@tinacms/astro/vite';
import cloudflare from '@astrojs/cloudflare';
import shrinkMedia from './src/integrations/shrink-media.mjs';

/**
 * The editor.
 *
 * TinaCMS, at /admin. The site went briefly without an editor at all, on the
 * reasoning that files in a repository are the honest source of truth. They are,
 * and they still are: nothing about that changed. What changed is that Ahmad has
 * to be able to edit them without a terminal, and the editor he had before that,
 * Keystatic, gave him a form on a screen that looked nothing like the website.
 * Type, save, wait, go and look, for every caption.
 *
 * Tina renders the real page next to the fields. He clicks a heading on the page
 * to open the field that writes it, and the page changes as he types.
 *
 * `output: 'static'` is unchanged and every page of the site is still a plain
 * file. The editor needs exactly one route that is not: /tina-island, which
 * renders a fragment of a page from unsaved values while somebody is editing.
 *
 * That route uses AsyncLocalStorage, so the Worker needs `nodejs_compat`. It is
 * set in wrangler.jsonc; without it the deploy builds and the editor's live
 * preview 500s, which is a confusing way to find out.
 */

/**
 * Served from the root of its own domain.
 *
 * Everything internal still goes through src/lib/url.ts. It is a passthrough at
 * a root base, and it is what would make a host that serves the site from a
 * subfolder work, without touching a single link or asset path.
 *
 * A custom domain needs no change here: Cloudflare Pages updates CF_PAGES_URL
 * once it is attached.
 */
export default defineConfig({
  /* Cloudflare Pages publishes the deploy URL as CF_PAGES_URL. */
  site: process.env.CF_PAGES_URL || 'https://ahmadassi.ca',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
  /* The adapter has always been needed for the deploy: it is what writes the
     wrangler config and the .wrangler/deploy pointer that `wrangler deploy`
     reads, and without it there is no config to deploy at all.

     It is now also needed for the site to work. With /tina-island present the
     build emits a real worker under dist/server rather than the static assets
     worker it emitted while every route prerendered. Both deploy the same way;
     this one can also answer a request. */
  adapter: cloudflare(),
  /* shrink-media runs on every build. It is the backstop that keeps an oversized
     file from reaching a visitor, so it must not be conditional on the thing
     that lets an oversized file arrive. */
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
