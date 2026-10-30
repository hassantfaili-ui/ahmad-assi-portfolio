import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, end, Client } = vi.hoisted(() => {
  const query = vi.fn(async (...args: unknown[]) => { void args; return { rows: [] }; });
  const end = vi.fn(async () => {});
  return { query, end, Client: vi.fn(function () { return { connect: async () => {}, query, end }; }) };
});
vi.mock('pg', () => ({ default: { Client } }));

import worker from '../../scripts/deploy-hyperdrive-worker.mjs';
import { assertSameSnapshot, snapshotHash, validateSnapshot } from '../../scripts/deploy-through-hyperdrive.mjs';

const env = {
  DEPLOY_BRIDGE_TOKEN: 'test-preview-token', BRIDGE_EXPIRES_AT: String(Date.now() + 60000),
  HYPERDRIVE: { connectionString: 'postgresql://preview-only' },
  SNAPSHOT_TABLES: JSON.stringify(['Project', 'Media']),
};
const request = (path: string, token = env.DEPLOY_BRIDGE_TOKEN) => new Request(`https://preview.example${path}`, {
  method: 'POST', headers: { authorization: `Bearer ${token}` },
});

beforeEach(() => { vi.clearAllMocks(); query.mockResolvedValue({ rows: [] }); });

describe('the temporary production preview', () => {
  it('refuses an unauthenticated request before opening a database connection', async () => {
    expect((await worker.fetch(request('/snapshot', 'wrong-token'), env)).status).toBe(401);
    expect(Client).not.toHaveBeenCalled();
  });

  it('expires even if someone keeps a preview URL', async () => {
    expect((await worker.fetch(request('/snapshot'), { ...env, BRIDGE_EXPIRES_AT: '0' })).status).toBe(410);
    expect(Client).not.toHaveBeenCalled();
  });

  it('has no endpoint for arbitrary SQL or credentials', async () => {
    expect((await worker.fetch(request('/sql'), env)).status).toBe(404);
    expect(Client).not.toHaveBeenCalled();
  });

  it('only adds the drawing crop columns, with a short lock timeout', async () => {
    expect((await worker.fetch(request('/prepare'), env)).status).toBe(200);
    const sql = query.mock.calls.map((args) => String(args[0])).join('\n');
    expect(sql).toContain("SET LOCAL lock_timeout = '3s'");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "ratio" TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "focusX" DOUBLE PRECISION NOT NULL DEFAULT 0.5');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "focusY" DOUBLE PRECISION NOT NULL DEFAULT 0.5');
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|UPDATE|INSERT|DROP)\b/);
    expect(end).toHaveBeenCalledOnce();
  });

  it('closes a failed connection and does not expose its credentials in the response', async () => {
    query.mockRejectedValueOnce(new Error('connection failed: secret-password'));
    const response = await worker.fetch(request('/snapshot'), env);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret-password');
    expect(end).toHaveBeenCalledOnce();
  });
});

describe('publishing the current content', () => {
  it('detects a changed caption even if the project and media counts stayed the same', () => {
    const source = { Project: [{ id: 'p1', summary: 'Original caption' }] };
    expect(() => assertSameSnapshot(source, { Project: [{ id: 'p1', summary: 'New caption' }] })).toThrow(/changed during the build/);
  });

  it('compares complete content while ignoring database column order', () => {
    const source = { Project: [{ id: 'p1', title: 'Live', body: 'Current text' }], Media: [{ id: 'm1' }] };
    const restored = { Media: [{ id: 'm1' }], Project: [{ body: 'Current text', title: 'Live', id: 'p1' }] };
    expect(snapshotHash(source)).toBe(snapshotHash(restored));
    expect(() => assertSameSnapshot(source, restored)).not.toThrow();
  });

  it('refuses an incomplete or empty snapshot', () => {
    expect(() => validateSnapshot({ Project: [{ id: 'p1' }] }, ['Project', 'Media'])).toThrow(/complete content model/);
    expect(() => validateSnapshot({ Project: [], Media: [{ id: 'm1' }] }, ['Project', 'Media'])).toThrow(/empty/);
  });
});
