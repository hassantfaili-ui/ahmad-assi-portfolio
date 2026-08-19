import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_JWT_HEADER, verifyAccessJwt } from '@/lib/access';
import { isAccessBypassed } from '@/lib/env';

/**
 * The request guard on the administration area and the routes that write.
 *
 * This is Next 16's proxy, which is what middleware.ts and its `middleware`
 * export were called up to Next 15. It has to sit beside the app directory,
 * which in this repository means src/ rather than the root, and the export has
 * to be named `proxy`. Get either wrong and it is never invoked: the build says
 * nothing, no route table entry appears, and every check below silently does
 * nothing while /admin answers to anyone. `next build` printing
 * "Proxy (Middleware)" is the only confirmation that it is wired up.
 *
 * Same reasoning as src/lib/access.ts: Cloudflare Access already turned an
 * unauthenticated request away at the edge, so this is defence in depth. It
 * catches the case where a hostname reaches the Worker without the Access
 * policy in front of it, and it turns that into a redirect rather than an open
 * administration area. It is a first pass, not the last one: every route
 * handler and server component still calls requireAdmin, because a matcher is a
 * list that somebody eventually forgets to add to.
 */

/**
 * Everything under these prefixes needs an identity. Everything else is public.
 *
 * The whole of /api is guarded, not the two route groups that exist today.
 * Listing them individually made the default fail open: a route handler added
 * later is public until somebody remembers this file, and nothing warns, because
 * an unmatched path never reaches the proxy at all. There is no error, no log
 * and no build failure to notice. Guarding the namespace inverts that, and a
 * route that genuinely has to be public can be excepted here deliberately.
 */
const GUARDED_PREFIXES = ['/admin', '/api'];

function isGuarded(pathname: string): boolean {
  return GUARDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The matcher below already narrows what gets here. This repeats the decision
  // because the two can drift: a matcher widened for some later route would
  // otherwise start running an authentication check over the public site.
  if (!isGuarded(pathname)) return NextResponse.next();

  // Local development, where there is no Access in front of the server at all.
  // This throws if it is ever set in production rather than quietly letting
  // everyone in, which is the whole reason the check lives in env.ts.
  if (isAccessBypassed()) return NextResponse.next();

  // No try block here on purpose. verifyAccessJwt returns null for every kind of
  // bad token and throws only when Access is unconfigured, and that has to
  // surface as a 500 rather than a redirect: a deployment nobody can sign in to
  // is a problem to fix, not a visitor to send home.
  const identity = await verifyAccessJwt(request.headers.get(ACCESS_JWT_HEADER));
  if (identity) return NextResponse.next();

  // The upload routes are called by fetch from the administration screens, so
  // they get a status their caller can read. A redirect there would arrive as an
  // HTML login page parsed as JSON, which is a much harder failure to diagnose.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/', request.url));
}

/**
 * Only the guarded prefixes are matched, so the public site never pays for this
 * and _next, the static assets and the image files are never touched.
 */
export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
};
