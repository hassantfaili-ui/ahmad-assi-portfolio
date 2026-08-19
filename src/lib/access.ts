import { createRemoteJWKSet, jwtVerify } from 'jose';
import { headers } from 'next/headers';

import { getAccessEnv, isAccessBypassed } from '@/lib/env';

/**
 * Who is acting, according to Cloudflare Access.
 *
 * Say this plainly, because it decides how much this file is allowed to be
 * wrong: this is defence in depth, not the only gate. Access refuses an
 * unauthenticated request at the edge, so in the ordinary case nothing without a
 * valid assertion ever reaches the Worker. This exists so that a misconfigured
 * Access policy, an application deleted from Zero Trust, a hostname added to the
 * Worker but not to the policy, fails closed rather than leaving the
 * administration area open to the internet. It also establishes who is acting,
 * which the edge check alone does not hand to the application.
 *
 * Access signs a JWT and puts it in the Cf-Access-Jwt-Assertion request header.
 * It is verified against the team's key set, checking the audience tag and the
 * issuer both. The audience alone is not enough: any Access team can mint a
 * token for any audience string, so without the issuer check a token from
 * somebody else's Zero Trust account would verify here.
 */

export interface AccessIdentity {
  email: string;
  sub: string;
}

/** The header Cloudflare Access sets. Lower case, since Headers is case insensitive. */
export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

/**
 * One key set per team, kept for the life of the isolate.
 *
 * createRemoteJWKSet holds the downloaded certificates in its own closure and
 * refetches only when a key it has never seen turns up, so building it once is
 * the difference between one fetch per isolate and one fetch per request. It is
 * keyed by team domain rather than being a bare module constant because
 * building it needs the environment, which is not readable at module load on
 * Workers.
 */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetFor(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = keySets.get(teamDomain);
  if (existing) return existing;

  const created = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  keySets.set(teamDomain, created);
  return created;
}

/**
 * Verify an Access assertion, or return null.
 *
 * Null covers every way a token can fail to prove anything: absent, malformed,
 * expired, signed by a key outside the team's set, issued for another
 * application, issued by another team, or carrying no email to name. None of
 * those are exceptional, they are just an unauthenticated request, and a caller
 * that has to wrap this in a try block would eventually forget to.
 *
 * The one thing that does throw is missing configuration, and it is deliberate.
 * A missing CF_ACCESS_AUD is not an unauthenticated visitor, it is a deployment
 * that cannot tell the two apart, and returning null there would be
 * indistinguishable from working correctly while nobody could ever sign in.
 */
export async function verifyAccessJwt(
  token: string | null | undefined,
): Promise<AccessIdentity | null> {
  if (!token) return null;

  const { teamDomain, audience } = getAccessEnv();

  try {
    const { payload } = await jwtVerify(token, keySetFor(teamDomain), {
      audience,
      issuer: `https://${teamDomain}`,
      // Pinned rather than left to the key set. jose picks the algorithm from
      // the JWK's own `alg`, so today this is decided by what Cloudflare's certs
      // endpoint publishes. A key that arrived without `alg` would widen the
      // accepted set to every RSA variant the key supports, which is a third
      // party's response body deciding this application's security posture.
      algorithms: ['RS256'],
      // Required, not merely validated when present. jose checks `exp` only if
      // the claim exists, so an assertion minted without one verifies forever.
      // For the one token that gates the administration area, a missing expiry
      // is the single most dangerous shape it can take.
      requiredClaims: ['exp', 'iat', 'sub'],
    });

    // Trimmed, because a whitespace only claim names nobody and would surface
    // later as a blank byline.
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (!email || !sub) return null;

    return { email, sub };
  } catch (error) {
    // Logged rather than swallowed. Fail closed is the right direction, but an
    // unreachable certs endpoint and a forged token are the same silent
    // redirect from the outside, and one of those is an outage that has to be
    // diagnosable. This is the only place that can tell them apart.
    console.error('Cloudflare Access assertion rejected', error);
    return null;
  }
}

/**
 * The identity on the current request, for server components and route
 * handlers. Null when there is no valid assertion.
 */
export async function getIdentity(): Promise<AccessIdentity | null> {
  /* The headers are read first, and the order is deliberate.
     isAccessBypassed throws when the bypass is set in production, which is the
     behaviour that matters: it means a deployment carrying the development
     escape hatch fails loudly rather than publishing the editor. But `next
     build` sets NODE_ENV to production for every build, including one on a
     laptop, so checking it before entering the request scope made that guard
     fire during prerendering and fail the build itself.
     Awaiting headers() first means this can only run while actually serving a
     request, which is the only time the guard has anything to say. */
  const requestHeaders = await headers();

  if (isAccessBypassed()) return { email: 'dev@localhost', sub: 'dev' };

  return verifyAccessJwt(requestHeaders.get(ACCESS_JWT_HEADER));
}

/** The identity, or null when there is no valid assertion. */
export async function requireAdmin(): Promise<AccessIdentity | null> {
  return getIdentity();
}
