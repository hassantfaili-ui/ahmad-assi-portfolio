import Link from 'next/link';

import { requireAdmin } from '@/lib/access';
import { ToastProvider } from '@/components/ui/toast';
import { AdminNav } from '@/components/admin/AdminNav';
import { UnsavedWorkProvider } from '@/components/admin/UnsavedWork';

/**
 * The gate on the whole administration area.
 *
 * This layout is the guard, and that is deliberate rather than convenient.
 * There was a proxy here doing the same job, which is the natural place for it,
 * and it had to come out: Next 16 runs the proxy on the Node runtime only, and
 * @opennextjs/cloudflare refuses to bundle Node middleware, so `next build`
 * succeeded and the deploy build then failed at its last step with no worker
 * written. Confirmed by building both ways.
 *
 * A layout is a better guard than the matcher was, for the reason the matcher
 * worried about. A matcher is a list somebody eventually forgets to add a route
 * to. A layout cannot be forgotten: every page nested under /admin renders
 * inside it, so there is no way to add a route here that escapes this check.
 * The API handlers are the part that still needs remembering, so there is a
 * test that fails if one of them stops calling its own guard.
 *
 * Cloudflare Access is still the real gate, refusing an unauthenticated request
 * at the edge before it reaches the Worker at all. This is what makes a
 * misconfigured Access policy fail closed rather than publishing the editor.
 */

/**
 * Never prerendered.
 *
 * These pages are per person and behind a login, so there is no such thing as a
 * correct static version of one. Rendering them at build time was not a
 * theoretical waste either: it ran requireAdmin during `next build`, where
 * NODE_ENV is always production, which tripped the guard that refuses to let
 * ACCESS_DEV_BYPASS be set in production and failed the deploy build outright.
 * A machine set up exactly as the README describes could not produce a worker.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const identity = await requireAdmin();

  /**
   * No identity, so nothing below this renders.
   *
   * A page rather than a redirect, for two reasons. Bouncing somebody silently
   * to the home page tells them nothing: they asked for the editor and got the
   * portfolio, with no indication whether they typed the wrong address, are
   * signed out, or are not allowed. And redirecting from a layout turned into a
   * 500 on Workers rather than a redirect, so the safe behaviour was arriving
   * as an error page anyway.
   *
   * This is not the security boundary. Cloudflare Access refuses the request at
   * the edge long before it reaches here, and this is what makes a misconfigured
   * policy fail closed instead of publishing the editor.
   */
  if (!identity) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-50 px-6">
        <main className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-neutral-900">You are not signed in</h1>
          <p className="mt-3 text-sm text-neutral-600">
            This is the editing area for ahmadassi.ca. It sits behind a sign in, and this browser
            does not have one. Open it from ahmadassi.ca/admin and Cloudflare will ask you for a
            code by email.
          </p>
          <p className="mt-6">
            <Link
              href="/"
              className="text-sm font-medium text-neutral-900 underline underline-offset-4"
            >
              Back to the site
            </Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <ToastProvider>
      {/* Above the navigation on purpose. The bar is the route out that Ahmad
          is most likely to take by habit, and it can only ask before discarding
          his work if it can see that there is any. */}
      <UnsavedWorkProvider>
        <div className="min-h-screen bg-neutral-50 text-neutral-900">
          <AdminNav email={identity.email} />
          <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
        </div>
      </UnsavedWorkProvider>
    </ToastProvider>
  );
}
