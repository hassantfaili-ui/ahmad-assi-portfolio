import type { Metadata } from 'next';

import { HomeForm } from '@/components/admin/HomeForm';
import { SignedOut } from '@/components/admin/SignedOut';
import { getIdentity } from '@/lib/access';
import { getClosingFilm, getHeroFilm, getProfile } from '@/lib/queries';

/**
 * The home page, in one screen.
 *
 * A server component that reads and a client component that edits, which is the
 * pattern every screen here follows. The three reads are what the home page
 * itself renders, in the order it renders them: the film at the top, the words
 * over it, and the film behind About and Get in touch at the foot.
 *
 * The hero film used to live under Settings, which was the only place left for
 * a film belonging to no project. That made the one thing a visitor sees first
 * the one thing Ahmad had to guess where to find, so /admin/settings now
 * redirects here.
 */

export const metadata: Metadata = {
  title: 'Home, Ahmad Assi',
};

export default async function AdminHomePage() {
  /* Guarded here as well as in the layout. An RSC request for this
     segment can render the page without re-rendering the layout, which
     skipped the layout's check entirely and served the editing data to
     anonymous requests. */
  if (!(await getIdentity())) return <SignedOut />;

  const [{ profile }, hero, closing] = await Promise.all([
    getProfile(),
    getHeroFilm(),
    getClosingFilm(),
  ]);

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          Everything at the top and the bottom of your home page, in the order a visitor meets it.
          The projects in between are on the Projects screen. Each part below has its own save
          button, so saving one never touches the others.
        </p>
      </header>

      <HomeForm profile={profile} hero={hero} closing={closing} />
    </div>
  );
}
