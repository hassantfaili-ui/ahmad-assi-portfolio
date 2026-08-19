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
 * function, which was putting a live DATABASE_URL inside the thing that gets
 * uploaded.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, '.open-next', 'server-functions', 'default');

/* Explicitly emptied for the build, whatever the developer's .env says. This
   is a deploy artefact: there is no such thing as a correct value here other
   than absent. */
function directorySize(path) {
  const info = statSync(path);
  if (!info.isDirectory()) return info.size;
  return readdirSync(path).reduce((total, entry) => total + directorySize(join(path, entry)), 0);
}

const build = spawnSync('npx', ['opennextjs-cloudflare', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, ACCESS_DEV_BYPASS: '' },
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
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

if (problems.length > 0) {
  console.error('\nThe build reported success but the artefact is not complete:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(
  `\nDeploy build complete. Worker written, ${required.length} installed ${
    required.length === 1 ? 'package' : 'packages'
  } present, no .env in the bundle.`,
);
