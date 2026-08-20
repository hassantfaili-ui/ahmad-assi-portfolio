import 'server-only';

import { cache } from 'react';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { requestScopedClient } from '@/lib/request-scoped-client';

/**
 * The Prisma client, one per request.
 *
 * Two things here are Workers specific and both were learned the hard way.
 *
 * A pooled connection cannot be shared between requests. A Worker is not a long
 * lived server: reusing one client across requests means a later request
 * inheriting a connection from an invocation that has already been torn down,
 * and it fails in ways that look intermittent. So the client is built per
 * request, and the pool is told maxUses: 1 so a connection is never handed out
 * twice.
 *
 * React's cache() is what makes that affordable. It memoises for the life of a
 * single request, so all fifty odd call sites across a render share one client
 * and one connection, and the next request gets its own. Outside a request, at
 * build time, it simply memoises per render, which is also what is wanted.
 *
 * The connection string comes from the Hyperdrive binding on Workers, which
 * pools and caches on Cloudflare's side, and falls back to DATABASE_URL
 * everywhere else.
 */

function resolveConnectionString(): { url: string; onWorkers: boolean } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env: Record<string, { connectionString?: string }> };
    };
    const hyperdrive = getCloudflareContext().env.HYPERDRIVE;
    if (hyperdrive?.connectionString) return { url: hyperdrive.connectionString, onWorkers: true };
  } catch {
    /* Not on Workers, or called outside a request. Both fall through. */
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('No Hyperdrive binding and no DATABASE_URL. The database is unreachable.');
  }
  return { url, onWorkers: false };
}

/**
 * The one client a Node process gets, held for its whole life.
 *
 * Per-request construction is a Workers requirement, not a virtue. Run under
 * `next build`, the same pattern built a client, and a pool, for every page a
 * build worker rendered and disconnected none of them, so nine workers
 * prerendering thirty pages held pools faster than Postgres could shed them
 * and CI died at TooManyConnections. One pool per process, capped low enough
 * that nine workers together stay under a default Postgres max_connections,
 * is the correct shape everywhere that is not a Worker.
 */
let nodeClient: PrismaClient | undefined;

/** One client for the life of one request on Workers, of the process elsewhere. */
const getClient = cache((): PrismaClient => {
  const { url: connectionString, onWorkers } = resolveConnectionString();

  if (!onWorkers && nodeClient) return nodeClient;

  const adapter = new PrismaPg({
    connectionString,
    /* On Workers, never hand the same connection to a second request. In a
       Node process, four connections per pool keeps nine parallel build
       workers under a hundred in total. */
    ...(onWorkers ? { maxUses: 1 } : { max: 4 }),
    ...(connectionString.includes('sslmode=require') || process.env.DATABASE_SSL === 'true'
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  if (!onWorkers) nodeClient = client;
  return client;
});

export function getDb(): PrismaClient {
  return getClient();
}

/**
 * Exported as a proxy so every call site reads `db.project.findMany()` while
 * still resolving a fresh client per request underneath. The alternative was
 * awaiting a getter at fifty two call sites for no gain in clarity.
 *
 * The binding is not decoration. An earlier version forwarded with
 * `Reflect.get(getClient(), property, receiver)`, where `receiver` is this
 * proxy, and that quietly broke `db.$transaction(async (tx) => ...)`. An
 * interactive transaction runs its body with `this` set to the client, and
 * Prisma builds the transaction-bound `tx` from that `this`. With the proxy as
 * `this`, every lookup inside the transaction was routed back out to the base
 * client, so `tx.project.update` ran outside the transaction that `BEGIN` had
 * opened, and the pinned transaction id came back as P2028, "Transaction not
 * found". Reads never noticed, because a read does not depend on `this` being
 * the transaction client. A whole-project save is one interactive transaction,
 * so every save failed and nothing else did.
 *
 * Resolving each property against the real client and binding functions to it
 * means `this` is the client wherever it matters, and a plain read still reads.
 */
export const db = requestScopedClient<PrismaClient>(getClient);
