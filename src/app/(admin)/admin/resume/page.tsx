import { SignedOut } from '@/components/admin/SignedOut';
import { getIdentity } from '@/lib/access';
import type { Metadata } from 'next';

import { ResumeForm } from '@/components/admin/ResumeForm';
import { getProfile } from '@/lib/queries';

/**
 * The resume screen.
 *
 * A server component that reads and a client component that edits, which is the
 * pattern every screen here follows. getProfile returns null for the profile
 * and an empty array for every list until something is saved, so this page has
 * to stand up against an empty database: the form treats that as the starting
 * state rather than an error.
 *
 * No authorisation check here. src/app/(admin)/admin/layout.tsx is the gate and
 * every page under it renders inside that gate.
 */

export const metadata: Metadata = { title: 'Resume' };

export default async function AdminResumePage() {
  /* Guarded here as well as in the layout. An RSC request for this
     segment can render the page without re-rendering the layout, which
     skipped the layout's check entirely and served the editing data to
     anonymous requests. */
  if (!(await getIdentity())) return <SignedOut />;

  const data = await getProfile();

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Resume</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          Everything on the resume page, plus the details that appear across the rest of the site.
          There are two save buttons, one for your details and one for the lists, so saving in one
          half never touches the other.
        </p>
      </header>

      <ResumeForm data={data} />
    </div>
  );
}
