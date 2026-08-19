import { SignedOut } from '@/components/admin/SignedOut';
import { getIdentity } from '@/lib/access';
import type { Metadata } from 'next';

import { HeroFilmEditor } from '@/components/admin/HeroFilmEditor';
import { getHeroFilm } from '@/lib/queries';

/**
 * Settings, which for this site is one thing: the film on the home page.
 *
 * The hero is the Film row with no project attached, so it belongs to no
 * project page and would have nowhere else to be edited from. It is read here
 * and handed to a client component, which is the pattern every editing screen
 * follows: the page fetches, the component holds the form and calls the server
 * actions.
 *
 * No guard here. The layout above this one runs requireAdmin, and every page
 * under /admin renders inside it.
 */

export const metadata: Metadata = {
  title: 'Settings, Ahmad Assi',
};

export default async function SettingsPage() {
  /* Guarded here as well as in the layout. An RSC request for this
     segment can render the page without re-rendering the layout, which
     skipped the layout's check entirely and served the editing data to
     anonymous requests. */
  if (!(await getIdentity())) return <SignedOut />;

  const hero = await getHeroFilm();

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-neutral-600">
          The film that plays behind your name on the home page.
        </p>
      </header>

      <HeroFilmEditor film={hero} />
    </div>
  );
}
