#!/usr/bin/env node
/**
 * Preflight for the editor.
 *
 *   npm run editor:check                 checks this machine
 *   npm run editor:check -- <site-url>   also checks the deployed site
 *
 * The editor has exactly one moving part in production, an environment
 * variable, and when it is wrong the failure is quiet: the site builds, every
 * page works, and /keystatic simply is not there. This makes that state loud.
 */
import { readFileSync } from 'node:fs';

const ok = (m) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const bad = (m) => console.log(`  \x1b[31mNO\x1b[0m    ${m}`);
const note = (m) => console.log(`        ${m}`);

const cloud = process.env.PUBLIC_KEYSTATIC_CLOUD_PROJECT;
const repo = process.env.PUBLIC_KEYSTATIC_GITHUB_REPO;
let fail = false;

console.log('\nEditor configuration\n');

if (cloud) {
  if (/^[\w-]+\/[\w-]+$/.test(cloud)) ok(`Keystatic Cloud project: ${cloud}`);
  else {
    bad(`PUBLIC_KEYSTATIC_CLOUD_PROJECT is "${cloud}"`);
    note('It has to look like team-name/project-name, nothing else.');
    fail = true;
  }
} else if (repo) {
  ok(`GitHub storage: ${repo}`);
  for (const k of ['KEYSTATIC_GITHUB_CLIENT_ID', 'KEYSTATIC_GITHUB_CLIENT_SECRET', 'KEYSTATIC_SECRET']) {
    if (process.env[k]) ok(`${k} is set`);
    else { bad(`${k} is missing`); fail = true; }
  }
} else {
  bad('No editor storage configured, so the built site will have no /keystatic');
  note('Set PUBLIC_KEYSTATIC_CLOUD_PROJECT to team-name/project-name.');
  note('Locally this is fine: npm run dev serves the editor against the files on disk.');
  fail = true;
}

/* The adapter is what gives the editor somewhere to run. Without it Astro
   emits a pure file deploy and the route cannot exist at all. */
const cfg = readFileSync('astro.config.mjs', 'utf8');
if (cfg.includes('adapter: cloudflare()')) ok('Server adapter is wired in astro.config.mjs');
else { bad('No server adapter found in astro.config.mjs'); fail = true; }

const url = process.argv[2];
if (url) {
  const base = url.replace(/\/+$/, '');
  console.log(`\nDeployed site: ${base}\n`);
  for (const path of ['/', '/keystatic']) {
    try {
      const res = await fetch(base + path, { redirect: 'follow' });
      if (res.ok) ok(`${path} responds ${res.status}`);
      else {
        bad(`${path} responds ${res.status}`);
        if (path === '/keystatic') {
          note('The site is up but the editor is not deployed.');
          note('Set the environment variable in the host, then redeploy.');
        }
        fail = true;
      }
    } catch (e) {
      bad(`${path} could not be reached: ${e.message}`);
      fail = true;
    }
  }
}

console.log(fail ? '\nNot ready. See above.\n' : '\nReady. The editor is at /keystatic.\n');
process.exit(fail ? 1 : 0);
