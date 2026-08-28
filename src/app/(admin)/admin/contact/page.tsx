import { SignedOut } from '@/components/admin/SignedOut';
import { getIdentity } from '@/lib/access';
import type { Metadata } from 'next';

import { ContactForm } from '@/components/admin/ContactForm';
import { getProfile } from '@/lib/queries';

/**
 * The contact screen.
 *
 * A server component that reads and a client component that edits, which is the
 * pattern every screen here follows. It reads the whole profile rather than the
 * contact fields alone, because both saves underneath rewrite everything they
 * touch: the form has to hand back the parts it does not show, or they go.
 *
 * getProfile returns null for the profile and empty arrays for the lists until
 * something is saved, so this page has to stand up against an empty database.
 * The form treats that as the starting state rather than an error.
 */

export const metadata: Metadata = { title: 'Contact' };

export default async function AdminContactPage() {
  /* Guarded here as well as in the layout. An RSC request for this
     segment can render the page without re-rendering the layout, which
     skipped the layout's check entirely and served the editing data to
     anonymous requests. */
  if (!(await getIdentity())) return <SignedOut />;

  const data = await getProfile();

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Contact</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          Everything your contact page says: the words at the top, how people reach you, the two
          PDFs they can download, and the links to elsewhere. Your email address, telephone number
          and where you are also show on the home page, the resume page and the footer, so changing
          one here changes it everywhere.
        </p>
      </header>

      <ContactForm data={data} />
    </div>
  );
}
