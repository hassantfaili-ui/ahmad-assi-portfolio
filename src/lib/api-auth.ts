import 'server-only';

import { NextResponse } from 'next/server';

import { getIdentity, type AccessIdentity } from '@/lib/access';

/**
 * The identity, or the 401 to return instead.
 *
 * A route handler cannot use requireAdmin: that redirects, and a redirect
 * arriving at a fetch() call is an HTML login page being parsed as JSON, which
 * is a far harder failure to read than a status code. So the handlers get a
 * status their caller can act on.
 *
 * The proxy already turned this request away, and Access turned it away before
 * that. This is the third layer, and it is the one that cannot be skipped by
 * editing a matcher.
 */
export async function requireIdentityOr401(): Promise<NextResponse | null> {
  const identity = await getIdentity();
  if (identity) return null;
  return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
}

export async function currentIdentity(): Promise<AccessIdentity | null> {
  return getIdentity();
}
