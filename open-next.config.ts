import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache';

/**
 * Pages are rendered once and held in KV rather than rebuilt for every visitor.
 * A save in the administration area revalidates the paths it changed, so Ahmad
 * sees his edit within seconds and a visitor never causes a database query.
 */
const config = defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
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

export default config;
