import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 takes the connection URL here rather than in the schema. This is for
 * the CLI only: migrate, db push and studio. The running application never
 * reads it, because src/lib/db.ts hands PrismaClient an adapter built from the
 * Hyperdrive binding on Workers, or from DATABASE_URL locally.
 */
const datasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error('Missing DIRECT_URL or DATABASE_URL. Copy .env.example to .env.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: datasourceUrl },
});
