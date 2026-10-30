/* A temporary, authenticated Wrangler remote preview. Never deployed to a
   public route. It reads content through the existing Hyperdrive binding;
   database credentials never leave Cloudflare. */
import { timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const headers = { 'Cache-Control': 'no-store' };

const worker = {
  async fetch(request, env) {
    const actual = new TextEncoder().encode(request.headers.get('authorization') ?? '');
    const expected = new TextEncoder().encode(`Bearer ${env.DEPLOY_BRIDGE_TOKEN}`);
    if (!env.DEPLOY_BRIDGE_TOKEN || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return new Response('Unauthorized', { status: 401, headers });
    }
    const expires = Number(env.BRIDGE_EXPIRES_AT);
    if (!Number.isFinite(expires) || Date.now() > expires) {
      return new Response('Preview expired', { status: 410, headers });
    }
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/health', '/prepare', '/snapshot'].includes(path)) {
      return new Response('Not found', { status: 404, headers });
    }

    const client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
    try {
      await client.connect();
      if (path === '/health') {
        const result = await client.query('SELECT count(*)::int AS projects FROM "Project"');
        return Response.json(result.rows[0], { headers });
      }
      if (path === '/prepare') {
        /* Only the additive schema change this release needs. No arbitrary
           SQL endpoint and no content writes. A busy table causes a refusal. */
        const columns = await client.query(`SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'Drawing'
          AND column_name IN ('ratio', 'focusX', 'focusY')`);
        if (columns.rows.length === 3) return Response.json({ prepared: true }, { headers });
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query(`ALTER TABLE "Drawing"
          ADD COLUMN IF NOT EXISTS "ratio" TEXT,
          ADD COLUMN IF NOT EXISTS "focusX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
          ADD COLUMN IF NOT EXISTS "focusY" DOUBLE PRECISION NOT NULL DEFAULT 0.5`);
        await client.query('COMMIT');
        return Response.json({ prepared: true }, { headers });
      }

      const tables = JSON.parse(env.SNAPSHOT_TABLES);
      if (!Array.isArray(tables) || !tables.every((name) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
        throw new Error('Invalid snapshot table list.');
      }
      /* One consistent reading, bypassing Hyperdrive's query cache inside a
         transaction. An edit cannot land halfway through a snapshot. */
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout = '15s'");
      const data = {};
      for (const table of tables) {
        const result = await client.query(`SELECT coalesce(json_agg(t ORDER BY t.id), '[]'::json) AS rows FROM (SELECT * FROM "${table}" ORDER BY id LIMIT 10001) t`);
        if (result.rows[0].rows.length > 10000) throw new Error(`Snapshot too large: ${table}.`);
        data[table] = result.rows[0].rows;
      }
      await client.query('COMMIT');
      const body = JSON.stringify({ tables: data });
      if (new TextEncoder().encode(body).byteLength > 8 * 1024 * 1024) {
        throw new Error('Snapshot exceeds the 8 MiB deployment limit.');
      }
      return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
    } catch {
      /* No connection strings or private row values in errors or logs. */
      return Response.json({ error: 'The production database operation failed. Nothing was deployed.' }, { status: 500, headers });
    } finally {
      await client.end();
    }
  },
};

export default worker;
