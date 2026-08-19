import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/access';
import { ToastProvider } from '@/components/ui/toast';
import { AdminNav } from '@/components/admin/AdminNav';

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

export const metadata: Metadata = {
  title: 'Editing, Ahmad Assi',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const identity = await requireAdmin();

  return (
    <ToastProvider>
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <AdminNav email={identity.email} />
        <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
