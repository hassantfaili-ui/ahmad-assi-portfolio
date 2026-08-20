import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every API route handler checks the identity itself.
 *
 * This test exists because the guard that used to cover them centrally had to
 * be removed. Next 16 runs the proxy on the Node runtime only, and
 * @opennextjs/cloudflare will not bundle Node middleware, so keeping it meant a
 * deploy build that produced no worker.
 *
 * The administration pages did not need replacing: src/app/admin/layout.tsx
 * wraps every route nested under it, and there is no way to add a page there
 * that escapes it. The API handlers are the part that still relies on somebody
 * remembering, which is exactly the kind of thing that is remembered until it
 * is not. So it is asserted here instead.
 */

const API_ROOT = join(process.cwd(), 'src', 'app', 'api');

function routeFiles(directory: string): string[] {
  let found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found = found.concat(routeFiles(path));
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      found.push(path);
    }
  }
  return found;
}

/**
 * Routes that deliberately do not check an identity, and what they do instead.
 *
 * An allowlist rather than a loosened rule. Each entry has to justify itself
 * here and is then checked for the guard it actually relies on, so an exemption
 * cannot be granted by accident or quietly stop being true.
 */
const EXEMPT: Record<string, { because: string; mustContain: RegExp }> = {
  'src/app/api/media-dev/[...key]/route.ts': {
    because:
      'Serves the original media off local disk so the site can be run without R2. ' +
      'It refuses to work in production instead, which is what is asserted below.',
    mustContain: /process\.env\.NODE_ENV === 'production'[\s\S]{0,120}status: 404/,
  },
};

function relative(file: string): string {
  return file.slice(process.cwd().length + 1);
}

/** One function's body, from its signature to the next top level close brace. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  if (start === -1) return '';
  const end = source.indexOf('\n}', start);
  return source.slice(start, end === -1 ? undefined : end);
}

/** The HTTP method handlers a route file exports. Next recognises exactly these. */
function exportedHandlers(source: string): string[] {
  return [
    ...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g),
  ].map((match) => match[1]);
}

/**
 * The handlers in a route source that do not guard themselves.
 *
 * Per handler, not per file, and both halves are demanded: the guard must be
 * called, and its verdict must be the thing returned. Matching the whole file
 * would let an unguarded second handler ride in on the first one's guard, and
 * matching the call alone would accept `await requireIdentityOr401()` with the
 * result thrown away, which refuses nobody.
 */
function unguardedHandlers(source: string): string[] {
  return exportedHandlers(source).filter((method) => {
    const body = bodyOf(source, method);
    if (!body) return true;

    const call = body.match(/const\s+([A-Za-z0-9_]+)\s*=\s*await\s+requireIdentityOr401\(\)/);
    if (!call) return true;

    return !new RegExp(`if\\s*\\(\\s*${call[1]}\\s*\\)\\s*return\\s+${call[1]}\\b`).test(body);
  });
}

describe('every API route handler guards itself', () => {
  const all = routeFiles(API_ROOT);
  const files = all.filter((file) => !(relative(file) in EXEMPT));

  it('finds the handlers at all, so a rename cannot make this pass vacuously', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(EXEMPT))(
    '%s is exempt, and still carries the guard it claims',
    (file, { mustContain }) => {
      const path = join(process.cwd(), file);
      // A stale allowlist entry is worse than none: it would exempt a route
      // that no longer exists while a new one at the old path went unchecked.
      expect(existsSync(path), `${file} is in the allowlist but does not exist`).toBe(true);
      expect(readFileSync(path, 'utf8')).toMatch(mustContain);
    },
  );

  it.each(files.map((file) => [relative(file), file]))(
    '%s guards every handler it exports',
    (_label, file) => {
      const source = readFileSync(file, 'utf8');

      // Imported, not merely mentioned in a comment.
      expect(source).toMatch(/import\s*\{[^}]*requireIdentityOr401[^}]*\}\s*from/);

      // A route file exporting no recognisable handler would otherwise pass
      // with nothing checked, which is the vacuous pass this file exists to stop.
      expect(exportedHandlers(source).length).toBeGreaterThan(0);

      expect(unguardedHandlers(source)).toEqual([]);
    },
  );
});

/**
 * Proof the per-handler matcher catches what per-file matching could not.
 *
 * The fixture is exactly the shape of the gap: a guarded GET, then a PATCH
 * added to the same file later. The old assertions matched the import and one
 * awaited call anywhere in the source, and this fixture satisfies both, so the
 * old check would have waved the PATCH through. Asserted here so the gap cannot
 * quietly reopen in a refactor of the matcher.
 */
describe('the per-handler matcher itself', () => {
  const guardedGetUnguardedPatch = [
    "import { requireIdentityOr401 } from '@/lib/api-auth';",
    '',
    'export async function GET(): Promise<Response> {',
    '  const unauthorised = await requireIdentityOr401();',
    '  if (unauthorised) return unauthorised;',
    '  return Response.json({ ok: true });',
    '}',
    '',
    'export async function PATCH(): Promise<Response> {',
    '  return Response.json({ patched: true });',
    '}',
    '',
  ].join('\n');

  it('catches an unguarded handler hiding behind a guarded one', () => {
    // The old per-file matching is satisfied by this source. That is the gap.
    expect(guardedGetUnguardedPatch).toMatch(/import\s*\{[^}]*requireIdentityOr401[^}]*\}\s*from/);
    expect(guardedGetUnguardedPatch).toMatch(/await\s+requireIdentityOr401\(\)/);

    expect(unguardedHandlers(guardedGetUnguardedPatch)).toEqual(['PATCH']);
  });

  it('does not flag the handler that really is guarded', () => {
    expect(unguardedHandlers(guardedGetUnguardedPatch)).not.toContain('GET');
  });

  it('catches a guard whose verdict is discarded', () => {
    const discarded = [
      'export async function DELETE(): Promise<Response> {',
      '  const unauthorised = await requireIdentityOr401();',
      '  return Response.json({ ok: true });',
      '}',
      '',
    ].join('\n');

    expect(unguardedHandlers(discarded)).toEqual(['DELETE']);
  });
});

/**
 * The two guards the editing area actually rests on.
 *
 * Neither was asserted, and both are exactly the kind the comment at the top of
 * this file warns about: a check that holds only because everyone has
 * remembered it so far.
 *
 * src/lib/mutations.ts carries 'use server', which means every exported async
 * function is a POST endpoint reachable on its own generated URL. Twelve of
 * them check the identity. Nothing failed if a thirteenth did not.
 *
 * The admin layout is the gate on every editing page, and it is a gate only
 * while it keeps calling requireAdmin.
 */

const MUTATIONS = join(process.cwd(), 'src', 'lib', 'mutations.ts');
const ADMIN_LAYOUT = join(process.cwd(), 'src', 'app', '(admin)', 'admin', 'layout.tsx');

/** Every `export async function name(` in a module. */
function exportedActions(source: string): string[] {
  return [...source.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g)].map(
    (match) => match[1],
  );
}

describe('every server action checks the identity', () => {
  const source = readFileSync(MUTATIONS, 'utf8');
  const actions = exportedActions(source);

  it('finds the actions at all', () => {
    // A rename or a refactor that stopped matching would otherwise make every
    // case below pass by finding nothing to check.
    expect(actions.length).toBeGreaterThanOrEqual(10);
    expect(actions).toContain('saveWholeProject');
    expect(actions).toContain('deleteProject');
  });

  it('is a server module, so each of those is its own endpoint', () => {
    expect(source.trimStart().startsWith("'use server'")).toBe(true);
  });

  it.each(exportedActions(readFileSync(MUTATIONS, 'utf8')).map((name) => [name]))(
    '%s refuses an unauthenticated caller',
    (name) => {
      const body = bodyOf(source, name);
      expect(body, `${name} has no body to check`).not.toBe('');
      expect(body, `${name} does not check the identity`).toMatch(
        /if\s*\(\s*!\(await authorised\(\)\)\s*\)\s*return DENIED/,
      );
    },
  );
});

describe('the administration layout is the gate it claims to be', () => {
  const source = readFileSync(ADMIN_LAYOUT, 'utf8');

  it('imports and awaits requireAdmin', () => {
    expect(source).toMatch(/import\s*\{[^}]*requireAdmin[^}]*\}\s*from/);
    expect(source).toMatch(/await\s+requireAdmin\(\)/);
  });

  it('is never prerendered, so the guard runs on a real request', () => {
    // Static rendering ran requireAdmin during `next build`, where NODE_ENV is
    // always production, which tripped the bypass guard and failed the deploy
    // build outright on a machine set up exactly as the README describes.
    expect(source).toMatch(/export const dynamic = 'force-dynamic'/);
  });
});

/**
 * Every administration page guards itself, and every editing query does too.
 *
 * The original test asserted the layout calls requireAdmin, which was necessary
 * and not sufficient. An RSC request for a page segment can render that page
 * without re-rendering its layout, so the layout's check was simply skipped:
 * an anonymous GET of /admin/media/?_rsc came back with all 294 object keys in
 * the bucket. Cloudflare Access would have refused that at the edge on the real
 * domain, which is exactly the comfort that let it go unnoticed.
 *
 * So the guard is asserted in two more places. On every page, so the segment
 * path renders a signed out state. And on every editing query, which is the one
 * that actually cannot be routed around.
 */

const ADMIN_PAGES = join(process.cwd(), 'src', 'app', '(admin)');
const ADMIN_QUERIES = join(process.cwd(), 'src', 'lib', 'admin-queries.ts');

function pageFiles(directory: string): string[] {
  let found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found = found.concat(pageFiles(path));
    else if (entry === 'page.tsx') found.push(path);
  }
  return found;
}

describe('every administration page refuses on its own', () => {
  const pages = pageFiles(ADMIN_PAGES);

  it('finds the pages, so a move cannot make this pass vacuously', () => {
    expect(pages.length).toBeGreaterThanOrEqual(5);
  });

  it.each(pages.map((file) => [relative(file), file]))('%s checks the identity', (_label, file) => {
    const source = readFileSync(file, 'utf8');
    expect(source, 'does not import the identity check').toMatch(
      /import\s*\{[^}]*getIdentity[^}]*\}\s*from/,
    );
    expect(source, 'does not act on the identity check').toMatch(/await\s+getIdentity\(\)/);
  });
});

describe('every editing query refuses on its own', () => {
  const source = readFileSync(ADMIN_QUERIES, 'utf8');
  const exported = [...source.matchAll(/export async function ([A-Za-z0-9_]+)\s*\(/g)].map(
    (match) => match[1],
  );

  it('finds the queries', () => {
    expect(exported.length).toBeGreaterThanOrEqual(4);
    expect(exported).toContain('listMedia');
  });

  it.each(exported.map((name) => [name]))('%s calls requireIdentity first', (name) => {
    const start = source.indexOf(`export async function ${name}(`);
    const end = source.indexOf('\n}', start);
    const body = source.slice(start, end === -1 ? undefined : end);

    expect(body, `${name} has no body`).not.toBe('');
    expect(body, `${name} does not require an identity`).toMatch(/await requireIdentity\(\)/);
  });
});
