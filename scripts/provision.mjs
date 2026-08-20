#!/usr/bin/env node
/**
 * Create the Cloudflare resources the site needs, and write their ids into
 * wrangler.jsonc.
 *
 * This exists because the ids are the fiddly part: three resources have to be
 * created, and their ids pasted into the right three placeholders, and getting
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
import { pathToFileURL } from 'node:url';

/**
 * The strings this script replaces with real ids. If any of them is gone from
 * wrangler.jsonc, the script has already run: creating the resources again
 * would make namespaces and a Hyperdrive that nothing points at, and the only
 * evidence would be a dashboard slowly filling with orphans. Refusing is the
 * idempotent behaviour, and the pure check lives here so the guard tests can
 * exercise it without touching a Cloudflare account.
 */
export const PLACEHOLDERS = ['PLACEHOLDER_KV_ID', 'PLACEHOLDER_TAG_KV_ID', 'PLACEHOLDER_HYPERDRIVE_ID'];

export function missingPlaceholders(config) {
  return PLACEHOLDERS.filter((placeholder) => !config.includes(placeholder));
}

function run(args, { capture = true } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (capture) process.stdout.write(output);
  return { status: result.status, output };
}

/* Everything below runs only when this file is the entry point, so the tests
   can import the placeholder check without spawning wrangler. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.argv[2];

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

  /* Checked before anything is created, because a resource made and then not
     written anywhere is worse than no resource at all. */
  const missing = missingPlaceholders(config);
  if (missing.length > 0) {
    console.error(
      `\nwrangler.jsonc has no ${missing.join(', ')} left to fill in.\n\n` +
        'That means provisioning has already run and the real ids are in the file.\n' +
        'Running the creation steps again would only make new resources that\n' +
        'nothing points at. To reprovision from scratch, put the placeholders back\n' +
        'into wrangler.jsonc first; to change one id, edit it in the file by hand.\n',
    );
    process.exit(1);
  }

  /* KV, for the rendered page cache. */
  console.log('\nCreating the page cache namespace');
  const kv = run(['kv', 'namespace', 'create', 'NEXT_INC_CACHE_KV']);
  const kvId = kv.output.match(/"?id"?\s*[:=]\s*"([a-f0-9]{32})"/i)?.[1];
  if (!kvId) {
    console.error('Could not read the namespace id out of that. Create it by hand and paste it in.');
    process.exit(1);
  }

  /* KV again, for the tag cache. Without it revalidatePath has nowhere to
     record that a page is stale, so an admin edit saves to the database and the
     site keeps serving the old copy, silently and indefinitely. */
  console.log('\nCreating the tag cache namespace');
  const tagKv = run(['kv', 'namespace', 'create', 'NEXT_TAG_CACHE_KV']);
  const tagKvId = tagKv.output.match(/"?id"?\s*[:=]\s*"([a-f0-9]{32})"/i)?.[1];
  if (!tagKvId) {
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
    .replace('PLACEHOLDER_TAG_KV_ID', tagKvId)
    .replace('PLACEHOLDER_HYPERDRIVE_ID', hyperdriveId);

  writeFileSync('wrangler.jsonc', config);

  console.log(`
Written into wrangler.jsonc:
  page cache   ${kvId}
  tag cache    ${tagKvId}
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
}
