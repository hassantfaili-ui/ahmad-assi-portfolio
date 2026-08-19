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
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, '.open-next', 'server-functions', 'default');

/* Explicitly emptied for the build, whatever the developer's .env says. This
   is a deploy artefact: there is no such thing as a correct value here other
   than absent. */
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
