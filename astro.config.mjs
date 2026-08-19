import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import shrinkMedia from './src/integrations/shrink-media.mjs';

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
  /* Every route prerenders, so nothing here needs a server. The adapter stays
     because the deploy does: the site is published with `wrangler deploy`, and it
     is the adapter that writes dist/client/wrangler.json and the
     .wrangler/deploy/config.json that points wrangler at it. Without it there is
     no config to deploy at all.

     With no on-demand route the worker it describes has no `main`, only
     `assets`, which is a static assets Worker and deploys as one. Verified with
     `wrangler deploy --dry-run`: config resolved, 383 assets read, no error.
     dist/server is empty and unused; that is expected, not a failure. */
  adapter: cloudflare(),
  /* shrink-media runs on every build. It is the backstop that keeps an oversized
     file from reaching a visitor. */
  integrations: [shrinkMedia()],
});
