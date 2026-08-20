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

function resolveConnectionString(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env: Record<string, { connectionString?: string }> };
    };
    const hyperdrive = getCloudflareContext().env.HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    /* Not on Workers, or called outside a request. Both fall through. */
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('No Hyperdrive binding and no DATABASE_URL. The database is unreachable.');
  }
  return url;
}

/** One client for the life of one request. */
const getClient = cache((): PrismaClient => {
  const connectionString = resolveConnectionString();

  const adapter = new PrismaPg({
    connectionString,
    /* Never hand the same connection to a second request. */
    maxUses: 1,
    ...(connectionString.includes('sslmode=require') || process.env.DATABASE_SSL === 'true'
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
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
