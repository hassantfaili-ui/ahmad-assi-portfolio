#!/usr/bin/env node
/**
 * Preflight for the editor.
 *
 *   npm run editor:check                 checks this machine
 *   npm run editor:check -- <site-url>   also checks the deployed site
 *
 * The editor's failure mode in production is quiet: the site builds, every page
 * works, and only saving is broken, or only the live preview is. This makes
 * those states loud, and names the variable behind each one.
 */
import { readFileSync } from 'node:fs';

const ok = (m) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const bad = (m) => console.log(`  \x1b[31mNO\x1b[0m    ${m}`);
const warn = (m) => console.log(`  \x1b[33m??\x1b[0m    ${m}`);
const note = (m) => console.log(`        ${m}`);

let fail = false;

console.log('\nEditor configuration\n');

/* Both are needed and they do different jobs. The client id names the TinaCloud
   project the admin signs in against and is baked into the admin bundle; the
   token is what the build uses to check the schema against that project. With
   only one of them set, `npm run build` falls back to a local-only client and
   the deployed editor cannot save at all. */
const clientId = process.env.PUBLIC_TINA_CLIENT_ID;
const token = process.env.TINA_TOKEN;

if (clientId && token) {
  ok(`TinaCloud project: ${clientId}`);
  ok('TINA_TOKEN is set');
} else {
  bad('No TinaCloud credentials, so the deployed editor will not be able to save');
  if (!clientId) note('PUBLIC_TINA_CLIENT_ID is missing. Get it from app.tina.io.');
  if (!token) note('TINA_TOKEN is missing. Get it from app.tina.io.');
  note('Locally this is fine: npm run dev edits the files on disk with no account.');
  fail = true;
}

/* The adapter is what gives the live preview route somewhere to run. Without it
   Astro emits a pure file deploy, /tina-island cannot exist, and the editor
   loads but shows a page that never changes as you type. */
const cfg = readFileSync('astro.config.mjs', 'utf8');
if (cfg.includes('adapter: cloudflare()')) ok('Server adapter is wired in astro.config.mjs');
else {
  bad('No server adapter found in astro.config.mjs, so live preview cannot run');
  fail = true;
}

/* AsyncLocalStorage is node:async_hooks, which workerd hides behind a flag. The
   deploy succeeds without it and the live preview 500s, which is the single most
   confusing state this project has. */
try {
  const wrangler = readFileSync('wrangler.jsonc', 'utf8');
  if (wrangler.includes('nodejs_compat')) ok('nodejs_compat is set in wrangler.jsonc');
  else {
    bad('wrangler.jsonc does not set nodejs_compat, so live preview will 500');
    fail = true;
  }
} catch {
  bad('wrangler.jsonc is missing, so the Worker will not have nodejs_compat');
  fail = true;
}

/* Films are the one upload that does not go through Git. Not having this is a
   perfectly good state to be in, it just means films stay a developer job, so
   it is reported rather than failed. */
const R2 = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'FILM_UPLOAD_KEY'];
const missingR2 = R2.filter((k) => !process.env[k]);
if (missingR2.length === 0) ok('Film uploads to R2 are configured');
else if (missingR2.length === R2.length) {
  warn('Film uploads are off, so the film field is a path to type');
  note('Set ' + R2.join(', ') + ' to switch them on. Not required.');
} else {
  bad(`Film uploads are half configured. Missing: ${missingR2.join(', ')}`);
  fail = true;
}

const url = process.argv[2];
if (url) {
  const base = url.replace(/\/+$/, '');
  console.log(`\nDeployed site: ${base}\n`);

  for (const path of ['/', '/admin/index.html']) {
    try {
      const res = await fetch(base + path, { redirect: 'follow' });
      if (res.ok) ok(`${path} responds ${res.status}`);
      else {
        bad(`${path} responds ${res.status}`);
        if (path !== '/') {
          note('The site is up but the editor was not built into it.');
          note('Set the variables in the host, then redeploy.');
        }
        fail = true;
      }
    } catch (e) {
      bad(`${path} could not be reached: ${e.message}`);
      fail = true;
    }
  }

  /* The live preview route. A GET is not how the editor talks to it, so 405 is
     the correct and expected answer: it proves the route exists and is running
     on a server rather than having been flattened into a static file. */
  try {
    const res = await fetch(`${base}/tina-island/project`, { method: 'GET' });
    if (res.status === 405) ok('/tina-island is running, so live preview will work');
    else if (res.status === 404) {
      bad('/tina-island is missing, so the editor will not update as you type');
      note('That route needs the server adapter and a Worker deploy, not a file deploy.');
      fail = true;
    } else warn(`/tina-island answered ${res.status}, which was not expected`);
  } catch (e) {
    bad(`/tina-island could not be reached: ${e.message}`);
    fail = true;
  }
}

console.log(fail ? '\nNot ready. See above.\n' : '\nReady. The editor is at /admin.\n');
process.exit(fail ? 1 : 0);
