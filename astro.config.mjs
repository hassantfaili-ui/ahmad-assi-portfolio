import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import netlify from '@astrojs/netlify';

/**
 * The editor.
 *
 * Keystatic's admin UI and its API need to run on a server, so the Netlify
 * adapter is here to give them somewhere to run. Everything else stays static:
 * `output: 'static'` is unchanged, and only the two Keystatic routes opt out of
 * prerendering. A visitor to any page of the portfolio is still served a plain
 * file, exactly as before.
 *
 * It is mounted whenever a GitHub repo is configured for it, and always during
 * `npm run dev` so it can be used locally against the files on disk. If the
 * GitHub credentials are missing the editor simply is not built, rather than
 * shipping a login page that cannot work.
 */
const editing = process.env.npm_lifecycle_event === 'dev';
const editorOnline = Boolean(process.env.PUBLIC_KEYSTATIC_GITHUB_REPO);

/**
 * Served from the root of its own domain.
 *
 * This used to switch between a root base for Netlify and a /ahmad-assi-portfolio
 * subpath for GitHub Pages. Pages is retired, and keeping the subpath for a host
 * nothing deploys to had a cost: Keystatic's admin UI routes itself from the site
 * root, so under a base path the editor loaded its shell and then 404'd on every
 * screen inside it.
 *
 * Everything internal still goes through src/lib/url.ts. It is a passthrough at
 * a root base, and it is what would make a subpath host work again if one is ever
 * needed, without touching a single link or asset path.
 *
 * A custom domain needs no change here: Netlify updates URL once it is attached.
 */
export default defineConfig({
  site: process.env.URL || 'https://ahmadassi.netlify.app',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
  /* The adapter is only needed when the editor is being built, and adding it
     unconditionally would turn a pure file deploy into one with functions
     attached for no reason. */
  ...(editorOnline ? { adapter: netlify() } : {}),
  integrations: editing || editorOnline ? [react(), keystatic()] : [],
});
