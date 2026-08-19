import 'server-only';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The Prisma client.
 *
 * Two ways in, depending on where this is running. On Cloudflare Workers the
 * connection string comes from the Hyperdrive binding, which pools and caches
 * the Neon connection so a Worker that lives for one request does not open a
 * new Postgres connection every time. Locally there is no binding, so it falls
 * back to DATABASE_URL.
 *
 * Exported as a proxy rather than an instance because the Hyperdrive binding is
 * only readable inside a request, so the client cannot be built at module load.
 * The proxy defers construction to the first property access, which is always
 * inside a request, and memoises it for the life of the isolate.
 */

let client: PrismaClient | undefined;

function resolveConnectionString(): string {
  // Workers first. This import is dynamic in effect: on a Node host the
  // binding is absent and the catch is the normal path, not an error case.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env: Record<string, { connectionString?: string }> };
    };
    const hyperdrive = getCloudflareContext().env.HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    /* not running on Workers, or called outside a request */
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('No Hyperdrive binding and no DATABASE_URL. The database is unreachable.');
  }
  return url;
}

function build(): PrismaClient {
  const connectionString = resolveConnectionString();
  const adapter = new PrismaPg({
    connectionString,
    ...(connectionString.includes('sslmode=require') || process.env.DATABASE_SSL === 'true'
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export function getDb(): PrismaClient {
  if (!client) client = build();
  return client;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});
