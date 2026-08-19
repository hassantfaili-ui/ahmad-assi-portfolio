#!/usr/bin/env node
/**
 * Create the Cloudflare resources the site needs, and write their ids into
 * wrangler.jsonc.
 *
 * This exists because the ids are the fiddly part: two resources have to be
 * created, and their ids pasted into the right two placeholders, and getting
 * one wrong produces a deploy that succeeds and then fails at the first
 * request with an error that does not mention the binding.
 *
 * It does NOT do the things that need a person:
 *   creating the Neon account and project
 *   wrangler login
 *   putting the R2 secret access key in as a secret
 *   attaching media.ahmadassi.ca to the bucket
 *   the Cloudflare Access application
 *   pointing ahmadassi.ca at the Worker
 *
 * Those are in docs/DEPLOYING.md. Run this after `wrangler login`, with the
 * Neon connection string to hand.
 *
 *   node scripts/provision.mjs "postgresql://user:pass@host/db?sslmode=require"
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const connectionString = process.argv[2];

function run(args, { capture = true } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (capture) process.stdout.write(output);
  return { status: result.status, output };
}

/* Signed in first. Every step below fails in a different confusing way without
   it, and none of them says "you are not logged in". */
const who = run(['whoami']);
if (who.status !== 0 || /not authenticated/i.test(who.output)) {
  console.error('\nRun `npx wrangler login` first, as Ahmad, not as anyone else.\n');
  process.exit(1);
}

if (!connectionString) {
  console.error(
    '\nPass the Neon connection string as the first argument. Create the project at\n' +
      'neon.tech first, and copy the POOLED string, the one ending in ?sslmode=require.\n',
  );
  process.exit(1);
}

let config = readFileSync('wrangler.jsonc', 'utf8');

/* KV, for the rendered page cache. */
console.log('\nCreating the page cache namespace');
const kv = run(['kv', 'namespace', 'create', 'NEXT_INC_CACHE_KV']);
const kvId = kv.output.match(/"?id"?\s*[:=]\s*"([a-f0-9]{32})"/i)?.[1];
if (!kvId) {
  console.error('Could not read the namespace id out of that. Create it by hand and paste it in.');
  process.exit(1);
}

/* Hyperdrive, so a Worker that lives for one request does not open a new
   Postgres connection every time. */
console.log('\nCreating the database pool');
const hyperdrive = run(['hyperdrive', 'create', 'ahmadassi-db', `--connection-string=${connectionString}`]);
const hyperdriveId = hyperdrive.output.match(/"?id"?\s*[:=]\s*"([a-f0-9]{32})"/i)?.[1];
if (!hyperdriveId) {
  console.error('Could not read the Hyperdrive id out of that. Create it by hand and paste it in.');
  process.exit(1);
}

config = config
  .replace('PLACEHOLDER_KV_ID', kvId)
  .replace('PLACEHOLDER_HYPERDRIVE_ID', hyperdriveId);

writeFileSync('wrangler.jsonc', config);

console.log(`
Written into wrangler.jsonc:
  page cache   ${kvId}
  database     ${hyperdriveId}

Commit that. Then, still from docs/DEPLOYING.md:

  1. npx prisma db push                        with DATABASE_URL set to the Neon string
  2. npm run migrate:content                   with the four R2 variables set, to upload the images
  3. attach media.ahmadassi.ca to the bucket   R2 dashboard, and turn on Image Transformations
  4. create the Access application             Zero Trust, covering /admin and /api
  5. npx wrangler secret put ...               the seven secrets
  6. npm run cf:build && npx wrangler deploy
  7. point ahmadassi.ca at the Worker          Workers dashboard, Custom Domains
`);
