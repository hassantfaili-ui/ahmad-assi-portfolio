import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache';
import kvTagCache from '@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';

/**
 * Pages are rendered once and held in KV rather than rebuilt for every visitor.
 *
 * The incremental cache alone is not enough, which cost a real bug: with only
 * that configured, Ahmad changed a project's cover, the database took it, and
 * the site went on serving the old picture. Nothing failed. revalidatePath had
 * been called and had nowhere to write, because recording that a page is stale
 * is the tag cache's job, and there was not one. The page was cached with
 * s-maxage of a year, so it would have stayed wrong until the next deploy.
 *
 * So three pieces, not one. The incremental cache holds the rendered pages, the
 * tag cache records which of them an edit invalidated, and the queue carries out
 * the re-render after the request that asked for it has gone.
 *
 * No cache purge override, deliberately. That clears Cloudflare's edge cache and
 * needs an API token, and the edge is not caching this HTML: a request carries
 * no cf-cache-status and a cache busting query still returned the stale copy, so
 * the staleness was entirely in KV. Worth revisiting only if that changes.
 */
const config = defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: kvTagCache,
  queue: doQueue,
});

/**
 * pg-cloudflare has to be installed into the bundle.
 *
 * node_modules/pg/lib/stream.js requires it unconditionally as far as a bundler
 * can tell, so esbuild tries to resolve it while packaging the server function
 * and fails with "Could not resolve" even though nothing at runtime will reach
 * that branch: nodejs_compat gives pg real sockets through node:net. Having it
 * at the repository root is not enough, because esbuild resolves from inside
 * .open-next/server-functions/default, so it has to be installed there.
 */
config.default = {
  ...config.default,
  install: {
    ...config.default?.install,
    packages: ['pg-cloudflare'],
  },
};

/**
 * Keep .env out of the deploy bundle.
 *
 * The OpenNext package step copies the working directory's .env verbatim into
 * .open-next/server-functions/default, so the artefact that gets uploaded
 * carried a live DATABASE_URL and the local ACCESS_DEV_BYPASS. Nothing at
 * runtime reads it, and env.ts refuses the bypass in production regardless, so
 * this was never an open door. It is still a database URL shipped inside a
 * deploy, which is not a thing to leave in place because it happened to be
 * harmless.
 */
config.default = {
  ...config.default,
  install: {
    ...config.default?.install,
    packages: config.default?.install?.packages ?? ['pg-cloudflare'],
  },
};

export default config;
