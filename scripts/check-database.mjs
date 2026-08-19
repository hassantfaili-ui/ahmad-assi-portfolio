#!/usr/bin/env node
/**
 * Confirm the database is reachable before the build starts.
 *
 * The Astro site read its content from markdown on disk, so a build could never
 * fail for want of a database. This one queries Postgres for every page, and
 * without this check an unreachable database surfaces as a Prisma P1001 buried
 * in a stack trace under "Export encountered an error on /print", which says
 * nothing about what is actually wrong or how to fix it.
 *
 * The build must fail in that case rather than degrade. A build that skipped
 * the missing content would publish an empty portfolio and cache it in KV,
 * which is a worse outcome than not deploying.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    '\nDATABASE_URL is not set, and the build reads every page from Postgres.\n' +
      'Copy .env.example to .env and point DATABASE_URL at your database.\n',
  );
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(url.includes('sslmode=require') ? { ssl: { rejectUnauthorized: false } } : {}),
  }),
});

try {
  const projects = await db.project.count();
  const media = await db.media.count();
  console.log(`Database reachable: ${projects} projects, ${media} media rows.`);

  if (projects === 0) {
    console.warn(
      '\nWarning: there are no projects. The build will succeed and publish a site\n' +
        'with an empty portfolio. Run `npm run migrate:content` first if that is not\n' +
        'what you meant.\n',
    );
  }
} catch (error) {
  console.error(
    `\nCannot reach the database at ${url.replace(/:[^:@/]+@/, ':***@')}\n\n` +
      'Every page on this site is rendered from Postgres, so the build cannot\n' +
      'continue without it. Start the database, or correct DATABASE_URL.\n',
  );
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await db.$disconnect();
}
