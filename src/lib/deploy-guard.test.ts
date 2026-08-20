import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import globalSetup from '../../e2e/global-setup';
import { findLeakedSecrets, sanitizeBundledEnv } from '../../scripts/cf-build.mjs';
import { isLocalDatabase, withoutPassword } from '../../scripts/local-database.mjs';
import { missingPlaceholders } from '../../scripts/provision.mjs';

/**
 * The deploy build prerenders every page from DATABASE_URL, so the HTML it
 * ships is a photograph of whichever database it was pointed at. Built from a
 * laptop and deployed, it replaces the live site with a copy of that laptop and
 * undoes every edit made in the admin since the copy was taken.
 *
 * That shipped once. The reachability check passed, because a local database is
 * reachable, and the row counts it printed matched, because the copy had the
 * same number of rows in it. Nothing else looked at which database it was.
 */
describe('which databases count as local', () => {
  it.each([
    'postgresql://hassan@localhost:5432/ahmadassi',
    'postgresql://user:pw@127.0.0.1:5432/ahmadassi',
    'postgresql://user:pw@[::1]:5432/ahmadassi',
    'postgresql://hassan@localhost/ahmadassi',
    /* Hostnames are case-insensitive, so these reach exactly the same machine
       as the lowercase spellings and must not slip past the deploy guard. */
    'postgresql://hassan@LOCALHOST:5432/ahmadassi',
    'postgresql://hassan@Localhost:5432/ahmadassi',
  ])('%s is local, so the deploy build must refuse it', (url) => {
    expect(isLocalDatabase(url)).toBe(true);
  });

  it.each([
    'postgresql://neondb_owner:pw@ep-morning-lake.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require',
    'postgresql://user:pw@db.example.com:5432/app',
    'postgres://user:pw@10.0.0.4:5432/app',
  ])('%s is not local, so the deploy build may use it', (url) => {
    expect(isLocalDatabase(url)).toBe(false);
  });

  it('is not fooled by a hostname that merely contains the word localhost', () => {
    expect(isLocalDatabase('postgresql://user:pw@localhost.evil.com:5432/app')).toBe(false);
  });

  it('treats a missing url as not local, so the caller reports the real problem', () => {
    /* An absent DATABASE_URL is its own error with its own message. Calling it
       local here would send someone off correcting a connection string that is
       not there at all. */
    expect(isLocalDatabase(undefined)).toBe(false);
    expect(isLocalDatabase('')).toBe(false);
  });

  it('takes the password out of anything it is asked to print', () => {
    expect(withoutPassword('postgresql://neondb_owner:npg_secret@ep-x.neon.tech/neondb')).toBe(
      'postgresql://neondb_owner:***@ep-x.neon.tech/neondb',
    );
    expect(withoutPassword('postgresql://neondb_owner:npg_secret@ep-x.neon.tech/neondb')).not.toContain(
      'npg_secret',
    );
  });
});

/**
 * The packaging step serialises the build machine's environment into
 * .open-next/cloudflare/next-env.mjs, and worker.js imports that file, so for
 * a while every deployed version carried the Neon password and the R2 keys in
 * plain text while the build announced a clean bundle. These are the two
 * functions cf-build.mjs now runs against the artefact: the sanitizer that
 * strips the secrets out of the snapshot, and the scan that fails the build on
 * anything that still looks like one.
 *
 * The fixtures use invented credentials with the same shapes as the real
 * ones: a postgresql:// string with an npg_ password, 32 and 64 character hex
 * keys.
 */
describe('the deploy bundle carries no secrets', () => {
  const FAKE_HEX_64 = '0123456789abcdef'.repeat(4);
  const FAKE_ENV = {
    DATABASE_URL: 'postgresql://neondb_owner:npg_notreal@ep-x.neon.tech/neondb?sslmode=require',
    ACCESS_DEV_BYPASS: '',
    CLOUDFLARE_R2_ACCOUNT_ID: '0'.repeat(32),
    CLOUDFLARE_R2_ACCESS_KEY_ID: '1'.repeat(32),
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: FAKE_HEX_64,
    CLOUDFLARE_R2_BUCKET: 'ahmadassi',
  };

  let bundle: string;

  function writeBundle() {
    bundle = mkdtempSync(join(tmpdir(), 'deploy-guard-'));
    const snapshot = JSON.stringify(FAKE_ENV);
    mkdirSync(join(bundle, 'cloudflare'), { recursive: true });
    writeFileSync(
      join(bundle, 'cloudflare', 'next-env.mjs'),
      `export const production = ${snapshot};\n` +
        `export const development = ${snapshot};\n` +
        `export const test = ${snapshot};\n`,
    );
    writeFileSync(join(bundle, 'worker.js'), 'export default {};\n');
    return bundle;
  }

  function exportedObjects(source: string) {
    const objects: Record<string, Record<string, string>> = {};
    for (const match of source.matchAll(/^export const (\w+) = (\{.*\});$/gm)) {
      objects[match[1]] = JSON.parse(match[2]);
    }
    return objects;
  }

  afterEach(() => {
    rmSync(bundle, { recursive: true, force: true });
  });

  it('strips DATABASE_URL and every CLOUDFLARE_R2_ key out of all three exports', () => {
    writeBundle();

    const removed = sanitizeBundledEnv(bundle);

    expect(removed).toEqual([
      'CLOUDFLARE_R2_ACCESS_KEY_ID',
      'CLOUDFLARE_R2_ACCOUNT_ID',
      'CLOUDFLARE_R2_BUCKET',
      'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
      'DATABASE_URL',
    ]);

    const objects = exportedObjects(readFileSync(join(bundle, 'cloudflare', 'next-env.mjs'), 'utf8'));
    expect(Object.keys(objects)).toEqual(['production', 'development', 'test']);
    for (const values of Object.values(objects)) {
      /* Absent, not blank: init.js copies these with ??=, so an empty string
         would win over the real runtime value and the Worker would try to
         reach the database with no connection string at all. */
      expect(Object.keys(values)).toEqual(['ACCESS_DEV_BYPASS']);
    }
  });

  it('fails an unsanitized bundle and passes a sanitized one', () => {
    writeBundle();

    const before = findLeakedSecrets(bundle);
    expect(before.some((finding) => finding.includes('postgresql://'))).toBe(true);
    expect(before.some((finding) => finding.includes('npg_'))).toBe(true);
    expect(before.some((finding) => finding.includes('64 character hex'))).toBe(true);

    sanitizeBundledEnv(bundle);
    expect(findLeakedSecrets(bundle)).toEqual([]);
  });

  it('finds a connection string anywhere in the bundle, not just in the env snapshot', () => {
    writeBundle();
    sanitizeBundledEnv(bundle);

    mkdirSync(join(bundle, 'server-functions', 'default'), { recursive: true });
    writeFileSync(
      join(bundle, 'server-functions', 'default', 'handler.mjs'),
      'const db = "postgresql://user:pw@ep-x.neon.tech/neondb";\n',
    );

    const findings = findLeakedSecrets(bundle);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(join('server-functions', 'default', 'handler.mjs'));
  });

  it('ignores assets, which are public files, and hex checksums in server chunks', () => {
    writeBundle();
    sanitizeBundledEnv(bundle);

    /* assets/ is the public web root: everything in it is already served to
       anyone who asks, so scanning it would only fail builds over content that
       is public either way. */
    mkdirSync(join(bundle, 'assets'), { recursive: true });
    writeFileSync(join(bundle, 'assets', 'page.js'), 'postgresql://example npg_example\n');

    /* Prisma's wasm build and the AWS request signer carry unrelated 64 hex
       constants, so the hex check must stay scoped to next-env.mjs and
       worker.js or it fails every build on someone else's checksums. */
    mkdirSync(join(bundle, 'server-functions', 'default'), { recursive: true });
    writeFileSync(join(bundle, 'server-functions', 'default', 'chunk.js'), `const hash = "${FAKE_HEX_64}";\n`);

    expect(findLeakedSecrets(bundle)).toEqual([]);

    /* The same hex in worker.js is a finding: nothing legitimate puts 64
       character hex in the entry point. */
    writeFileSync(join(bundle, 'worker.js'), `const leaked = "${FAKE_HEX_64}";\n`);
    expect(findLeakedSecrets(bundle)).toHaveLength(1);
  });
});

/**
 * provision.mjs fills placeholders in wrangler.jsonc with the ids of the
 * resources it creates. Once the ids are written the placeholders are gone, so
 * a second run used to create a fresh set of resources and then have nowhere
 * to record them: orphans in the dashboard, nothing in the config. The script
 * now refuses to create anything when a placeholder is missing, and this is
 * the check it refuses on.
 */
describe('provisioning refuses to run twice', () => {
  it('reports nothing missing while every placeholder is still in the file', () => {
    const config =
      '{ "kv_namespaces": [ { "id": "PLACEHOLDER_KV_ID" }, { "id": "PLACEHOLDER_TAG_KV_ID" } ],' +
      ' "hyperdrive": [ { "id": "PLACEHOLDER_HYPERDRIVE_ID" } ] }';
    expect(missingPlaceholders(config)).toEqual([]);
  });

  it('reports every placeholder, the tag cache one included, once real ids are in', () => {
    const config =
      '{ "kv_namespaces": [ { "id": "16f75036435c4717afd84d98a443eaad" }, { "id": "4e8fa232d5b145029ee56e432c47ee01" } ],' +
      ' "hyperdrive": [ { "id": "8ce38335941d4d65bfd16407cfbcc2a0" } ] }';
    expect(missingPlaceholders(config)).toEqual([
      'PLACEHOLDER_KV_ID',
      'PLACEHOLDER_TAG_KV_ID',
      'PLACEHOLDER_HYPERDRIVE_ID',
    ]);
  });

  it('reports a partial fill, so a half-run leaves a trail instead of a mystery', () => {
    const config = '{ "kv_namespaces": [ { "id": "PLACEHOLDER_KV_ID" } ] }';
    expect(missingPlaceholders(config)).toEqual(['PLACEHOLDER_TAG_KV_ID', 'PLACEHOLDER_HYPERDRIVE_ID']);
  });
});

/**
 * The refusal message of the browser suite guard suggests a command to copy
 * and paste. It once printed its own source code instead, because the
 * interpolation was typed with shell parentheses, $(...), rather than template
 * braces, so the suggestion contained the literal text "process.env.USER".
 *
 * This belongs beside the guard's other tests in e2e-guard.test.ts and should
 * move there when that file is next touched.
 */
describe('the browser suite guard suggests a command a person can paste', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = original;
    delete process.env.E2E_ALLOW_REMOTE_DATABASE;
  });

  it('renders the username into the suggested command instead of printing source', () => {
    process.env.DATABASE_URL = 'postgresql://user:pw@ep-x.neon.tech/neondb';
    delete process.env.E2E_ALLOW_REMOTE_DATABASE;

    try {
      globalSetup();
      throw new Error('the guard should have refused a remote database');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('$(process.env.USER');
      expect(message).toContain(
        `DATABASE_URL="postgresql://${process.env.USER ?? 'you'}@localhost:5432/ahmadassi" npm run e2e`,
      );
    }
  });
});
