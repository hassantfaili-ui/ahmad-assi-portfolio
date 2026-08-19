import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache';

/**
 * Pages are rendered once and held in KV rather than rebuilt for every visitor.
 * A save in the administration area calls revalidateTag, so Ahmad sees his
 * change within seconds and a visitor never causes a database query.
 */
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
