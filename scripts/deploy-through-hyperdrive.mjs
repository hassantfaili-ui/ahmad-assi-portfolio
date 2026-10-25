#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Prisma } from '@prisma/client';
import pg from 'pg';
import ts from 'typescript';
import { isLocalDatabase } from './local-database.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Column order can differ after ALTER TABLE. Row order is fixed by id. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function snapshotHash(tables) {
  return createHash('sha256').update(JSON.stringify(canonical(tables))).digest('hex');
}

export function assertSameSnapshot(expected, actual) {
  if (snapshotHash(expected) !== snapshotHash(actual)) {
    throw new Error('Production content changed during the build. Nothing was deployed; run this command again.');
  }
}

export function validateSnapshot(tables, names) {
  if (!tables || Object.keys(tables).sort().join(',') !== [...names].sort().join(',')) {
    throw new Error('Snapshot does not contain the complete content model.');
  }
  for (const name of names) {
    const rows = tables[name];
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.id !== 'string')) {
      throw new Error(`Invalid snapshot rows for ${name}.`);
    }
  }
  if (!tables.Project?.length || !tables.Media?.length) {
    throw new Error('Refusing to publish an empty production snapshot.');
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((yes, no) => server.once('error', no).listen(0, '127.0.0.1', yes));
  const port = server.address().port;
  await new Promise((yes) => server.close(yes));
  return port;
}

async function run(command, args, env = process.env) {
  const child = spawn(command, args, { cwd: ROOT, env, stdio: 'inherit' });
  await new Promise((yes, no) => {
    child.once('error', no);
    child.once('exit', (code) => code === 0 ? yes() : no(new Error(`${command} failed (${code}).`)));
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((yes) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => { clearTimeout(timer); yes(); });
    child.kill('SIGTERM');
  });
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== '--build-only')) throw new Error('Only --build-only is supported.');
  const buildOnly = process.argv.includes('--build-only');
  const local = process.env.DATABASE_URL ?? '';
  if (!isLocalDatabase(local)) throw new Error('This command needs a local Postgres connection in .env for a disposable build database.');
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'));
  if (parsed.error) throw new Error('Could not read wrangler.jsonc.');
  const config = parsed.config;
  const hyperdrive = config.hyperdrive?.find((item) => item.binding === 'HYPERDRIVE');
  if (!hyperdrive?.id) throw new Error('No production HYPERDRIVE binding configured.');
  const models = Prisma.dmmf.datamodel.models;
  const tables = models.map((model) => model.dbName ?? model.name);
  if (!tables.every((name) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name))) throw new Error('Unsupported table name.');

  mkdirSync(join(ROOT, '.wrangler'), { recursive: true });
  const scratch = mkdtempSync(join(ROOT, '.wrangler', 'production-build-'));
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + 20 * 60 * 1000;
  const previewConfig = join(scratch, 'wrangler.jsonc');
  writeFileSync(join(scratch, '.dev.vars'), `DEPLOY_BRIDGE_TOKEN=${token}\n`, { mode: 0o600 });
  writeFileSync(previewConfig, JSON.stringify({
    name: `${config.name}-deploy-preview`,
    main: join(ROOT, 'scripts/deploy-hyperdrive-worker.mjs'),
    compatibility_date: '2026-10-24', compatibility_flags: ['nodejs_compat'],
    hyperdrive: [{ binding: 'HYPERDRIVE', id: hyperdrive.id }],
    vars: { SNAPSHOT_TABLES: JSON.stringify(tables), BRIDGE_EXPIRES_AT: String(expires) },
  }, null, 2));
  const port = await freePort();
  const inspector = await freePort();
  const logPath = join(ROOT, '.wrangler', 'production-deploy-preview.log');
  const log = createWriteStream(logPath, { mode: 0o600 });
  const preview = spawn(process.execPath, [join(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
    'dev', '--remote', '--config', previewConfig, '--ip', '127.0.0.1',
    '--port', String(port), '--inspector-port', String(inspector), '--show-interactive-dev-session=false',
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  preview.stdout.pipe(log);
  preview.stderr.pipe(log, { end: false });
  const request = async (path, timeout = 60000) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`Cloudflare production preview refused ${path} (${response.status}).`);
    return response.json();
  };
  let databaseCreated = false;
  const database = `ahmadassi_cf_build_${randomBytes(6).toString('hex')}`;
  const adminUrl = new URL(local);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  let replica;

  try {
    let ready = false;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (preview.exitCode !== null) throw new Error(`Cloudflare preview exited. See ${logPath}.`);
      try { await request('/health', 5000); ready = true; break; } catch { await delay(500); }
    }
    if (!ready) throw new Error(`Could not reach Cloudflare preview. See ${logPath}.`);
    console.log('Production database reached through the existing Cloudflare Hyperdrive binding.');
    await request('/prepare');
    const source = (await request('/snapshot')).tables;
    validateSnapshot(source, tables);
    console.log(`Read production snapshot: ${source.Project.length} projects, ${source.Media.length} media rows.`);

    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    databaseCreated = true;
    const replicaUrl = new URL(local);
    replicaUrl.pathname = `/${database}`;
    const env = {
      ...process.env, DATABASE_URL: replicaUrl.toString(), DIRECT_URL: replicaUrl.toString(),
      ACCESS_DEV_BYPASS: '', NEXT_PUBLIC_MEDIA_ORIGIN: config.vars.MEDIA_ORIGIN,
      MEDIA_ORIGIN: config.vars.MEDIA_ORIGIN,
    };
    await run('npm', ['run', 'db:push'], env);
    replica = new pg.Client({ connectionString: replicaUrl.toString() });
    await replica.connect();
    await replica.query('BEGIN');
    /* The schema declares parents before children: Media, Project, groups,
       pictures, drawings, films, then their sources and the resume lists. */
    for (const table of tables) {
      if (source[table].length) {
        await replica.query(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`, [JSON.stringify(source[table])]);
      }
    }
    await replica.query('COMMIT');
    const copied = {};
    for (const table of tables) {
      const result = await replica.query(`SELECT coalesce(json_agg(t ORDER BY t.id), '[]'::json) AS rows FROM "${table}" t`);
      copied[table] = result.rows[0].rows;
    }
    assertSameSnapshot(source, copied);
    await replica.end();
    replica = undefined;
    console.log('Verified the disposable build database matches production, field for field.');
    await run('npm', ['run', 'cf:build'], { ...env, DEPLOY_FROM_LOCAL_DATABASE: 'true' });
    assertSameSnapshot(source, (await request('/snapshot')).tables);
    console.log('Production content is unchanged since the snapshot. Build is ready.');
    if (!buildOnly) {
      /* OpenNext opens a local platform proxy to populate its cache. This
         emulation value is needed by Wrangler even though deploy itself does
         not query the database. Keep it out of the build's inlined env. */
      await run('npm', ['run', 'cf:deploy'], {
        ...env, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: replicaUrl.toString(),
      });
      console.log('Deployed using current production content. Database credentials stayed in Cloudflare.');
    }
  } finally {
    await replica?.end();
    await stop(preview);
    log.end();
    if (databaseCreated) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
