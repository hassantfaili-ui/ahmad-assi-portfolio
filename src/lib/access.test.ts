import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

import { verifyAccessJwt } from './access';

/**
 * The tokens here are real: signed by a key pair generated in beforeAll, and
 * verified through the same jose path production uses. Only the network is
 * faked, by stubbing the fetch that pulls the team's key set, because that is
 * the one thing a unit test cannot have. A hand written fake verifier would
 * prove nothing about whether the real one accepts the real token shape.
 */

const TEAM_DOMAIN = 'ahmadassi.cloudflareaccess.com';
const ISSUER = `https://${TEAM_DOMAIN}`;
const CERTS_URL = `${ISSUER}/cdn-cgi/access/certs`;
const AUDIENCE = '0e1a2b3c4d5e6f708192a3b4c5d6e7f80912a3b4c5d6e7f80912a3b4c5d6e7f8';
const KID = 'a-key-that-cloudflare-would-have-rotated-in';

let privateKey: CryptoKey;

const nowInSeconds = () => Math.floor(Date.now() / 1000);

interface Claims {
  email?: string | null;
  sub?: string;
  issuer?: string;
  audience?: string | string[];
  expiresAt?: number;
  kid?: string;
}

async function mint(claims: Claims = {}): Promise<string> {
  const payload: Record<string, unknown> = { type: 'app', country: 'CA' };
  if (claims.email !== null) payload.email = claims.email ?? 'ahmad@ahmadassi.ca';

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: claims.kid ?? KID })
    .setIssuedAt(nowInSeconds() - 30)
    .setSubject(claims.sub ?? 'a-stable-cloudflare-identity-id')
    .setIssuer(claims.issuer ?? ISSUER)
    .setAudience(claims.audience ?? [AUDIENCE])
    .setExpirationTime(claims.expiresAt ?? nowInSeconds() + 3600)
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;

  const jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };

  vi.stubGlobal('fetch', async (url: string) => {
    if (String(url) !== CERTS_URL) {
      throw new Error(`The key set was fetched from ${url} rather than ${CERTS_URL}`);
    }
    return new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', TEAM_DOMAIN);
  vi.stubEnv('CF_ACCESS_AUD', AUDIENCE);
  vi.stubEnv('ACCESS_DEV_BYPASS', '');
});

/**
 * Run something as though it were inside a request.
 *
 * getIdentity awaits headers() before anything else, so every test of it needs
 * a request scope. Stubbing the module rather than faking getIdentity keeps the
 * real ordering under test, which is the thing that broke.
 */
async function withRequest<T>(
  run: (identity: typeof import('./access')) => Promise<T>,
  header: string | null = null,
): Promise<T> {
  vi.doMock('next/headers', () => ({
    headers: async () => ({ get: () => header }),
  }));
  vi.resetModules();
  try {
    // Imported fresh inside the mock. The module bound at the top of this file
    // still holds the real next/headers, so calling that copy would defeat the
    // stub entirely.
    return await run(await import('./access'));
  } finally {
    vi.doUnmock('next/headers');
    vi.resetModules();
  }
}

describe('verifyAccessJwt', () => {
  it('returns the identity from a token Access would have issued', async () => {
    const identity = await verifyAccessJwt(await mint());
    expect(identity).toEqual({
      email: 'ahmad@ahmadassi.ca',
      sub: 'a-stable-cloudflare-identity-id',
    });
  });

  it('returns null for an expired token', async () => {
    expect(await verifyAccessJwt(await mint({ expiresAt: nowInSeconds() - 60 }))).toBeNull();
  });

  it('returns null when the audience is another application', async () => {
    expect(await verifyAccessJwt(await mint({ audience: ['some-other-application'] }))).toBeNull();
  });

  it('returns null when the issuer is another team', async () => {
    expect(
      await verifyAccessJwt(await mint({ issuer: 'https://attacker.cloudflareaccess.com' })),
    ).toBeNull();
  });

  it('returns null when the signing key is not in the team key set', async () => {
    expect(await verifyAccessJwt(await mint({ kid: 'a-key-nobody-published' }))).toBeNull();
  });

  it('returns null for a malformed token rather than throwing', async () => {
    expect(await verifyAccessJwt('not-a-jwt')).toBeNull();
    expect(await verifyAccessJwt('a.b.c')).toBeNull();
    expect(await verifyAccessJwt('')).toBeNull();
  });

  it('returns null for an absent header', async () => {
    expect(await verifyAccessJwt(null)).toBeNull();
    expect(await verifyAccessJwt(undefined)).toBeNull();
  });

  it('returns null when the token carries no email, since there is nobody to name', async () => {
    expect(await verifyAccessJwt(await mint({ email: null }))).toBeNull();
  });

  it('throws when Access is not configured, because that is broken rather than unauthorised', async () => {
    vi.stubEnv('CF_ACCESS_AUD', '');
    try {
      await expect(verifyAccessJwt(await mint())).rejects.toThrow(/CF_ACCESS_AUD/);
    } finally {
      vi.stubEnv('CF_ACCESS_AUD', AUDIENCE);
    }
  });
});

describe('getIdentity', () => {
  it('returns the local development identity when the bypass is set', async () => {
    vi.stubEnv('ACCESS_DEV_BYPASS', 'true');
    try {
      // Inside a request scope, which is now required. The bypass used to be
      // decided before the headers were touched, and that is what let it fire
      // during `next build`, where NODE_ENV is always production, and fail the
      // deploy build on a machine configured exactly as the README says.
      expect(await withRequest((access) => access.getIdentity())).toEqual({
        email: 'dev@localhost',
        sub: 'dev',
      });
    } finally {
      vi.stubEnv('ACCESS_DEV_BYPASS', '');
    }
  });
});

/**
 * The cases an adversarial review found missing. Each one is a way the guard
 * could be wholly broken while every test above stayed green, which makes them
 * the only tests here that are load bearing rather than confirming.
 */
describe('verifyAccessJwt, the failures that matter', () => {
  it('refuses a token with no expiry, however well signed', async () => {
    // jose validates exp only when the claim is present, so without
    // requiredClaims an assertion minted without one verifies forever. For the
    // single token that gates the administration area that is the worst
    // possible shape, and it is not caught by any expiry test.
    const forever = await new SignJWT({ email: 'forever@example.ca' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt(nowInSeconds() - 30)
      .setSubject('a-stable-cloudflare-identity-id')
      .setIssuer(ISSUER)
      .setAudience([AUDIENCE])
      .sign(privateKey);

    expect(await verifyAccessJwt(forever)).toBeNull();
  });

  it('refuses a token signed by a different key that claims the published kid', async () => {
    // The kid mismatch test exercises key lookup. This exercises signature
    // verification, which is the actual security property: an attacker picks
    // the kid, so a correct kid must not be enough.
    const foreign = await generateKeyPair('RS256', { extractable: true });
    const forged = await new SignJWT({ email: 'attacker@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt(nowInSeconds() - 30)
      .setSubject('forged')
      .setIssuer(ISSUER)
      .setAudience([AUDIENCE])
      .setExpirationTime(nowInSeconds() + 3600)
      .sign(foreign.privateKey);

    expect(await verifyAccessJwt(forged)).toBeNull();
  });

  it('refuses an email claim that is only whitespace', async () => {
    expect(await verifyAccessJwt(await mint({ email: '   ' }))).toBeNull();
  });
});

describe('getIdentity, the header it actually reads', () => {
  it('reads the assertion from Cf-Access-Jwt-Assertion and nothing else', async () => {
    // Without this, ACCESS_JWT_HEADER could be misspelled and every test above
    // would still pass, because none of them go through a request at all.
    const token = await mint();
    const captured: string[] = [];

    vi.doMock('next/headers', () => ({
      headers: async () => ({
        get: (name: string) => {
          captured.push(name);
          return name.toLowerCase() === 'cf-access-jwt-assertion' ? token : null;
        },
      }),
    }));

    vi.resetModules();
    const { getIdentity: freshGetIdentity } = await import('./access');
    const identity = await freshGetIdentity();

    expect(captured.map((name) => name.toLowerCase())).toContain('cf-access-jwt-assertion');
    expect(identity).toEqual({
      email: 'ahmad@ahmadassi.ca',
      sub: 'a-stable-cloudflare-identity-id',
    });

    vi.doUnmock('next/headers');
    vi.resetModules();
  });
});

describe('the development bypass', () => {
  it('refuses to work in production, rather than opening the administration area', async () => {
    // The most dangerous variable in the system, and it had no coverage at all.
    vi.stubEnv('ACCESS_DEV_BYPASS', 'true');
    vi.stubEnv('NODE_ENV', 'production');

    vi.doMock('next/headers', () => ({ headers: async () => ({ get: () => null }) }));
    vi.resetModules();
    const { getIdentity: freshGetIdentity } = await import('./access');

    await expect(freshGetIdentity()).rejects.toThrow(/ACCESS_DEV_BYPASS/);
    vi.doUnmock('next/headers');

    vi.stubEnv('ACCESS_DEV_BYPASS', '');
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();
  });

  it('names a development identity when it is on outside production', async () => {
    vi.stubEnv('ACCESS_DEV_BYPASS', 'true');
    vi.stubEnv('NODE_ENV', 'development');

    vi.doMock('next/headers', () => ({ headers: async () => ({ get: () => null }) }));
    vi.resetModules();
    const { getIdentity: freshGetIdentity } = await import('./access');
    expect(await freshGetIdentity()).toEqual({ email: 'dev@localhost', sub: 'dev' });
    vi.doUnmock('next/headers');

    vi.stubEnv('ACCESS_DEV_BYPASS', '');
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();
  });
});
