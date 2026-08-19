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
