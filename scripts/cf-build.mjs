#!/usr/bin/env node
/**
 * The deploy build, with an exit code that tracks whether it worked.
 *
 * opennextjs-cloudflare prints "Could not install dependencies" and then exits
 * 0. On this project that message is a red herring: its install helper scandirs
 * a .bin directory that a package with no binaries never creates, and the
 * package itself lands perfectly well. But a real install failure would print
 * the same line and also exit 0, and would then only surface at deploy or at
 * runtime.
 *
 * So this does not grep the log for that message, which would fail every build.
 * It checks the artefact instead: the worker exists, and every package the
 * config asks to be installed is actually in the bundle. Asserting the outcome
 * is both stricter and quieter than asserting the absence of a warning.
 *
 * It also removes the .env that the packaging step copies into the server
 * function, strips the secrets the same step bakes into
 * cloudflare/next-env.mjs, and then refuses to ship anything that still looks
 * like a credential. The removals are corrections; the scan is the guarantee,
 * because it fails the build on whatever new copy of the environment the next
 * tool version decides to write.
 */

/* next build reads .env itself, so this wrapper has to read it too. Without
   this the check below sees no DATABASE_URL at all and cannot tell which
   database the build it is about to start will actually use. dotenv does not
   overwrite what is already set, so an explicit DATABASE_URL=... on the command
   line still wins. */
import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isLocalDatabase, withoutPassword } from './local-database.mjs';

const ROOT = process.cwd();
const OPEN_NEXT = join(ROOT, '.open-next');
const BUNDLE = join(ROOT, '.open-next', 'server-functions', 'default');

/**
 * Refuse to prerender the live site from a database that is not the live one.
 *
 * `next build` renders all 29 pages by querying DATABASE_URL, so the HTML that
 * ships is a photograph of whichever database the build happened to be pointed
 * at. Point it at a laptop and the deploy publishes the laptop: every edit made
 * in the admin since that copy was taken silently disappears from the site
 * while sitting perfectly intact in the real database.
 *
 * That is not hypothetical. It shipped. Ahmad changed the lead photograph on a
 * project, the deploy went out built from a local copy, and the site went back
 * to the old photograph with nothing anywhere reporting a problem. The
 * reachability check passed, because a local database is reachable, and the
 * counts it printed matched, because the copy had the same number of rows.
 *
 * A local database is the one thing this build can never legitimately use, so
 * that is what it refuses. Set DEPLOY_FROM_LOCAL_DATABASE=true to override,
 * which is only ever right for testing the packaging itself.
 */
function refuseLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';

  if (!url) {
    console.error('\nDATABASE_URL is not set, and the deploy build renders every page from it.\n');
    process.exit(1);
  }

  if (!isLocalDatabase(url) || process.env.DEPLOY_FROM_LOCAL_DATABASE === 'true') return url;

  console.error(
    `\nThis build would publish the site from ${withoutPassword(url)}\n\n` +
      'Every page is prerendered from DATABASE_URL at build time, so deploying\n' +
      'this bundle would replace the live site with a copy of your local database\n' +
      'and undo every edit made in the admin since that copy was taken.\n\n' +
      'Build against the real database instead:\n\n' +
      '  DATABASE_URL="<the production connection string>" npm run cf:build\n\n' +
      'If you genuinely mean to package a local build, set\n' +
      'DEPLOY_FROM_LOCAL_DATABASE=true\n',
  );
  process.exit(1);
}

function hostOf(url) {
  const match = /@([^/:]+)/.exec(url);
  return match ? match[1] : 'an unrecognised host';
}

function directorySize(path) {
  const info = statSync(path);
  if (!info.isDirectory()) return info.size;
  return readdirSync(path).reduce((total, entry) => total + directorySize(join(path, entry)), 0);
}

/**
 * Strip the build machine's secrets out of the env snapshot in the bundle.
 *
 * The packaging step serialises the environment `next build` ran with into
 * .open-next/cloudflare/next-env.mjs, and worker.js imports that file through
 * cloudflare/init.js. So every deployed version was carrying the Neon
 * connection string, password included, and all four CLOUDFLARE_R2_ values in
 * plain text, while this script announced a clean bundle because the .env file
 * itself was gone.
 *
 * Deleting the keys is safe because init.js copies the snapshot with ??=: an
 * absent key falls through to the real runtime environment, which is exactly
 * where these values are meant to come from, DATABASE_URL from Hyperdrive and
 * the R2 values from wrangler secrets. Deleting rather than blanking matters
 * for the same reason: ??= would keep an empty string, and the runtime values
 * would never be reached.
 *
 * Returns the names of the keys it removed. An export it cannot parse is left
 * alone on purpose: findLeakedSecrets runs afterwards and fails the build on
 * anything that still holds a credential, which is the honest outcome when the
 * file stops looking like what this expects.
 */
export function sanitizeBundledEnv(openNextDir) {
  const snapshot = join(openNextDir, 'cloudflare', 'next-env.mjs');
  if (!existsSync(snapshot)) return [];

  const removed = new Set();
  const source = readFileSync(snapshot, 'utf8');
  const sanitized = source.replace(/^(\s*export const \w+\s*=\s*)(\{.*\})(;?\s*)$/gm, (line, prefix, object, suffix) => {
    let values;
    try {
      values = JSON.parse(object);
    } catch {
      return line;
    }
    for (const key of Object.keys(values)) {
      if (key === 'DATABASE_URL' || key.startsWith('CLOUDFLARE_R2_')) {
        delete values[key];
        removed.add(key);
      }
    }
    return `${prefix}${JSON.stringify(values)}${suffix}`;
  });

  if (removed.size > 0) writeFileSync(snapshot, sanitized);
  return [...removed].sort();
}

/**
 * Find anything under .open-next that still looks like a live credential.
 *
 * assets/ is skipped because it is the public web root: everything in it is
 * already served to anyone who asks, and it is where content hashes
 * legitimately live. Everywhere else, a postgres url with credentials or a
 * Neon password prefix has no business existing at all.
 *
 * The url check demands the credential shape, scheme then userinfo then @,
 * rather than the bare scheme: Prisma's query compiler wasm carries the
 * literal text "must start with the protocol `postgresql://`" in its error
 * messages, and a check that fails every build over someone else's error
 * strings is a gate people learn to bypass. A connection string worth
 * refusing always has an @ in it.
 *
 * The 64 character hex check, the shape of an R2 secret access key, only runs
 * against next-env.mjs and worker.js. Those are the two files a copied
 * environment actually lands in, and neither contains hex of that length for
 * any legitimate reason. The minified server chunks do: Prisma's wasm build
 * and the AWS request signer both carry unrelated 64 hex constants, so a
 * blanket check would fail every build on someone else's checksums.
 */
export function findLeakedSecrets(openNextDir) {
  const findings = [];
  const hexCheckedFiles = new Set([
    join(openNextDir, 'cloudflare', 'next-env.mjs'),
    join(openNextDir, 'worker.js'),
  ]);
  const assets = join(openNextDir, 'assets');

  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        if (child !== assets) visit(child);
        continue;
      }
      if (!entry.isFile()) continue;

      const text = readFileSync(child, 'utf8');
      const where = relative(openNextDir, child);
      if (/postgres(?:ql)?:\/\/[^\s"'`@]{1,128}@/.test(text)) {
        findings.push(`${where} contains a postgresql:// connection string with credentials`);
      }
      if (text.includes('npg_')) {
        findings.push(`${where} contains an npg_ prefix, the shape of a Neon password`);
      }
      if (hexCheckedFiles.has(child) && /\b[0-9a-f]{64}\b/.test(text)) {
        findings.push(`${where} contains a 64 character hex string, the shape of an R2 secret access key`);
      }
    }
  };
  visit(openNextDir);
  return findings;
}

/* Everything below runs only when this file is the entry point. The two
   functions above are imported by the deploy guard tests, and importing a
   module must not start a build. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const buildDatabase = refuseLocalDatabase();

  /* ACCESS_DEV_BYPASS is explicitly emptied for the build, whatever the
     developer's .env says. This is a deploy artefact: there is no such thing as
     a correct value here other than absent. */
  const build = spawnSync('npx', ['opennextjs-cloudflare', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, ACCESS_DEV_BYPASS: '' },
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  /* Before the artefact checks, so nothing below ever looks at a bundle that
     still holds the build machine's secrets. */
  const strippedKeys = sanitizeBundledEnv(OPEN_NEXT);
  if (strippedKeys.length > 0) {
    console.log(
      `Removed ${strippedKeys.join(', ')} from cloudflare/next-env.mjs. ` +
        'The Worker reads them from Hyperdrive and wrangler secrets instead.',
    );
  }

  const problems = [];

  const worker = join(ROOT, '.open-next', 'worker.js');
  if (!existsSync(worker)) {
    problems.push('No worker was written at .open-next/worker.js');
  }

  /* Whatever open-next.config.ts asks to be installed has to be in the bundle.
     This is the check that would have caught a genuine install failure, which the
     tool reports and then exits 0 over. */
  let required = [];
  try {
    const config = await import(pathToFileURL(join(ROOT, 'open-next.config.ts')).href);
    required = config.default?.default?.install?.packages ?? [];
  } catch {
    problems.push('Could not read open-next.config.ts to find out what should be installed');
  }

  for (const name of required) {
    const bare = name.replace(/@[^@/]+$/, '');
    if (!existsSync(join(BUNDLE, 'node_modules', bare))) {
      problems.push(`${bare} was supposed to be installed into the bundle and is not there`);
    }
  }

  /**
   * The media originals do not belong in the deploy.
   *
   * public/media, public/cv and public/portfolio are the migration script's
   * input: they are the masters, kept in git, that get uploaded to R2 once. The
   * site reads every one of them from media.ahmadassi.ca, so nothing in the
   * running application asks for these paths.
   *
   * Next copies the whole of public/ into the output regardless, which put 108MB
   * of full resolution originals into every deploy and, worse, published a second
   * delivery path for them: ahmadassi.ca/media/<project>/<file>.jpg answered 200
   * with the untouched 617KB original, bypassing the image resizing entirely, for
   * anyone who guessed the path.
   *
   * Removed here rather than moved out of public/, because public/ is exactly
   * where the migration script and local development both expect to find them.
   */
  const NOT_FOR_DEPLOY = ['media', 'cv', 'portfolio'];
  let reclaimed = 0;

  for (const name of NOT_FOR_DEPLOY) {
    const path = join(ROOT, '.open-next', 'assets', name);
    if (!existsSync(path)) continue;
    reclaimed += directorySize(path);
    rmSync(path, { recursive: true, force: true });
  }

  if (reclaimed > 0) {
    console.log(`Removed ${(reclaimed / 1024 / 1024).toFixed(0)}MB of media originals from the bundle.`);
  }

  const bundledEnv = join(BUNDLE, '.env');
  if (existsSync(bundledEnv)) {
    rmSync(bundledEnv);
    console.log('Removed the copied .env from the server function bundle.');
  }

  /* The guarantee, as distinct from the corrections above: whatever shape the
     next leak takes, a bundle that still holds a credential does not ship. */
  for (const finding of findLeakedSecrets(OPEN_NEXT)) {
    problems.push(finding);
  }

  if (problems.length > 0) {
    console.error('\nThe build reported success but the artefact is not fit to deploy:');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('');
    process.exit(1);
  }

  console.log(
    `\nDeploy build complete. Worker written, ${required.length} installed ${
      required.length === 1 ? 'package' : 'packages'
    } present, no secrets left in the bundle.`,
  );

  /* Last line, because it is the one that would have caught this. The pages in
     this bundle are a photograph of that database and of nothing else. */
  console.log(`Pages were prerendered from ${hostOf(buildDatabase)}.`);
}
