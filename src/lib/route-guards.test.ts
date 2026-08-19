import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
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

describe('every API route handler guards itself', () => {
  const files = routeFiles(API_ROOT);

  it('finds the handlers at all, so a rename cannot make this pass vacuously', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [file.replace(process.cwd(), '.'), file]))(
    '%s calls requireIdentityOr401',
    (_label, file) => {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('requireIdentityOr401');

      // Imported and called, not merely mentioned in a comment.
      expect(source).toMatch(/import\s*\{[^}]*requireIdentityOr401[^}]*\}\s*from/);
      expect(source).toMatch(/await\s+requireIdentityOr401\(\)/);
    },
  );
});
