/**
 * Environment access, in one place, so a missing variable fails with its own
 * name rather than as `undefined` three layers down.
 *
 * The split matters: anything read through getServerEnv is server only. R2
 * credentials and the Access audience must never reach the browser, and the
 * only way they can is if something imports them into a client component, so
 * they live behind a function that throws rather than in a bare export.
 */

function read(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getDatabaseUrl(): string {
  return read('DATABASE_URL');
}

export interface R2Env {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function getR2Env(): R2Env {
  return {
    accountId: read('CLOUDFLARE_R2_ACCOUNT_ID'),
    accessKeyId: read('CLOUDFLARE_R2_ACCESS_KEY_ID'),
    secretAccessKey: read('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    bucket: read('CLOUDFLARE_R2_BUCKET'),
  };
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      process.env.CLOUDFLARE_R2_BUCKET,
  );
}

export interface AccessEnv {
  teamDomain: string;
  audience: string;
}

export function getAccessEnv(): AccessEnv {
  return {
    teamDomain: read('CF_ACCESS_TEAM_DOMAIN').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    audience: read('CF_ACCESS_AUD'),
  };
}

export function isAccessConfigured(): boolean {
  return Boolean(process.env.CF_ACCESS_TEAM_DOMAIN && process.env.CF_ACCESS_AUD);
}

/**
 * Local development only. It skips Access verification so /admin is reachable
 * without a tunnel.
 *
 * This throws rather than returning false in production, because the failure it
 * prevents is the administration area silently open to the internet, and a
 * variable left set by accident is exactly how that would happen.
 *
 * It has already earned its keep once. Next reads .env at build time, so the
 * bypass a developer is told to put in their own .env was baked into a deployed
 * worker, and this is what caught it. scripts/cf-build.mjs now empties it for
 * the build as well, so there are two things to get wrong rather than one.
 */
export function isAccessBypassed(): boolean {
  const bypass = process.env.ACCESS_DEV_BYPASS === 'true';
  if (bypass && process.env.NODE_ENV === 'production') {
    throw new Error(
      'ACCESS_DEV_BYPASS is set in production. That would leave /admin open to anyone. Unset it.',
    );
  }
  return bypass;
}
