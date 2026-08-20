import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

type Step = { name?: string; run?: string; env?: Record<string, string> };

/**
 * The pipeline broke in ways no gate reported: the deploy build's local
 * database guard failed every run because the workflow predates it, the lint
 * step ran stricter flags than `npm run lint` so local green did not mean CI
 * green, and a failed browser run uploaded an empty report because the github
 * reporter writes no files. Each of those lived in configuration nothing
 * exercised, which is why these tests read the configuration itself.
 */
describe('the workflow and the guard in cf-build agree', () => {
  const workflow = parse(read('.github/workflows/checks.yml'));
  const steps: Step[] = workflow.jobs.checks.steps;

  it('lets the Deploy build step package from the CI database', () => {
    /* CI's DATABASE_URL is the runner's own localhost Postgres, which is
       exactly what refuseLocalDatabase in scripts/cf-build.mjs exits 1 over.
       Nothing deploys from CI, the step only proves packaging works, so the
       documented override belongs on this step. */
    const deploy = steps.find((step) => step.name === 'Deploy build');
    expect(deploy?.env?.DEPLOY_FROM_LOCAL_DATABASE).toBe('true');
  });

  it('scopes the override to that one step', () => {
    /* Job-wide, the override would also blunt the guard for any future step
       that really does deploy. It is safe precisely because it is local to the
       packaging test. */
    expect(workflow.jobs.checks.env).not.toHaveProperty('DEPLOY_FROM_LOCAL_DATABASE');
    for (const step of steps) {
      if (step.name === 'Deploy build') continue;
      expect(step.env ?? {}).not.toHaveProperty('DEPLOY_FROM_LOCAL_DATABASE');
    }
  });

  it('lints through npm run lint, so the flags cannot drift from local runs', () => {
    expect(steps.some((step) => step.run?.trim() === 'npm run lint')).toBe(true);
    expect(steps.some((step) => step.run?.includes('eslint'))).toBe(false);
  });
});

describe('package.json holds the single copy of the shared settings', () => {
  const pkg = JSON.parse(read('package.json'));

  it('makes the lint script itself warning-strict', () => {
    /* This is where the drift lived: `eslint .` passed warnings locally that
       CI's --max-warnings=0 then failed. One script, both places run it. */
    expect(pkg.scripts.lint).toBe('eslint . --max-warnings=0');
  });

  it('requires a node with default TypeScript type-stripping', () => {
    /* cf-build imports open-next.config.ts directly. Below 22.18.0 that needs
       a flag, and the failure it produces points nowhere near the real cause,
       so the engines floor is the only honest error message. */
    const floor = /^>=(\d+)\.(\d+)\.\d+$/.exec(pkg.engines.node);
    expect(floor).not.toBeNull();
    const [major, minor] = floor!.slice(1).map(Number);
    expect(major > 22 || (major === 22 && minor >= 18)).toBe(true);
  });
});

describe('the Playwright reporter writes what the failure artifact uploads', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('adds an html report on CI, without trying to open a browser there', async () => {
    vi.resetModules();
    vi.stubEnv('CI', 'true');
    const config = (await import('../../playwright.config')).default;
    /* The github reporter only annotates the log. html is the one that writes
       playwright-report/, the path upload-artifact looks for on failure. */
    expect(config.reporter).toContainEqual(['html', { open: 'never' }]);
    expect(config.reporter).toContainEqual(['github']);
  });

  it('keeps the plain list reporter for local runs', async () => {
    vi.resetModules();
    vi.stubEnv('CI', '');
    const config = (await import('../../playwright.config')).default;
    expect(config.reporter).toBe('list');
  });
});
