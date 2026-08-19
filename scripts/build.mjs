#!/usr/bin/env node
/**
 * `npm run build`, in the two shapes this project has to build in.
 *
 * Tina generates a client before Astro runs, and that client has to be told
 * where the *editor* will read content from once the site is deployed. There is
 * no single answer, because there are two legitimate states for this repository
 * to be in:
 *
 *   WITH Tina Cloud credentials, which is production. `--content=local` reads
 *   the content out of this checkout, so the build is fast and needs no network
 *   for content, while still emitting a client that points the deployed admin at
 *   TinaCloud so saving works.
 *
 *   WITHOUT them, which is a fresh clone, a fork, or the site before anybody has
 *   signed up. `--local` builds a client pointing at the local GraphQL server.
 *   The site builds and every page of it works; only the editor does not, and
 *   `npm run editor:check` says so in as many words.
 *
 * Picking automatically rather than failing is the point. The alternative is a
 * Cloudflare deploy that goes red on the first push with ERR_MISSING_CLOUD_CREDS
 * before a single page is emitted, for a variable that has nothing to do with
 * whether the website works.
 */
import { spawn } from 'node:child_process';

const cloud = Boolean(process.env.PUBLIC_TINA_CLIENT_ID && process.env.TINA_TOKEN);

const args = cloud
  ? ['tinacms', 'build', '--content=local', '-c', 'astro build']
  : ['tinacms', 'build', '--local', '--skip-cloud-checks', '-c', 'astro build'];

if (!cloud) {
  console.warn(
    '\n  Building without Tina Cloud credentials.\n' +
      '  The site will be complete; the editor at /admin will not be able to save.\n' +
      '  Set PUBLIC_TINA_CLIENT_ID and TINA_TOKEN to change that. See docs/EDITING.md.\n',
  );
}

const child = spawn('npx', ['--no-install', ...args], { stdio: 'inherit', shell: false });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
child.on('error', (error) => {
  console.error(`Could not start the Tina build: ${error.message}`);
  process.exit(1);
});
