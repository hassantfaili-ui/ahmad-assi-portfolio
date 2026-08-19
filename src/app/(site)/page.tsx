import type { Metadata } from 'next';
import Link from 'next/link';

import HeroFilm from '@/components/site/HeroFilm';
import ProjectGrid from '@/components/site/ProjectGrid';
import Reveal from '@/components/site/Reveal';
import { mediaUrl, posterUrl } from '@/lib/media-url';
import { getHeroFilm, getProfile, getPublishedProjects } from '@/lib/queries';

/* Short enough to read over moving footage. The full version is on the resume. */
const INTRO =
  'A graduate of the Bachelor of Architectural Studies at Carleton University, ' +
  'majoring in urbanism. I work between design and the site itself: masterplans ' +
  'and drawings on one side, construction and built interiors on the other.';

/* The database is empty until the migration runs, and every page has to render
   anyway. These are the same defaults src/app/layout.tsx falls back to, so an
   empty database reads as the site with nothing in it rather than as a fault. */
const FALLBACK_NAME = 'Ahmad Assi';
const FALLBACK_TITLE = 'Ahmad Assi, Architectural Designer';
const FALLBACK_DESCRIPTION = 'Portfolio of Ahmad Assi, architectural designer in Ottawa, Ontario.';

/** A tel: URI takes digits and a leading plus, nothing else. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getProfile();

  const title = profile ? `${profile.name}, ${profile.discipline}` : FALLBACK_TITLE;
  const description = profile?.positioning || FALLBACK_DESCRIPTION;

  return {
    title,
    description,
    alternates: { canonical: '/' },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function Home() {
  const [projects, { profile }, hero] = await Promise.all([
    getPublishedProjects(),
    getProfile(),
    getHeroFilm(),
  ]);

  const name = profile?.name ?? FALLBACK_NAME;
  /* The Astro page wrote "Ahmad" and "Assi" into the markup by hand. They come
     off the profile now so the hero and the wordmark in the header cannot end
     up disagreeing about the name. */
  const [firstName, ...restOfName] = name.split(' ');
  const surname = restOfName.join(' ');

  const email = profile?.email ?? '';
  const phone = profile?.phone ?? '';

  /* Two encodes, the tallest and the shortest of whatever has been uploaded.
     The migration writes 1440 and 720, and HeroFilm decides between them in the
     browser. Reading the two ends of the list rather than two fixed heights
     means a third encode added later widens the choice instead of breaking it,
     and one encode alone simply gets used for both. */
  const encodes = hero?.sources ?? [];
  const largest = encodes[0]?.media.key;
  const smallest = encodes[encodes.length - 1]?.media.key;

  return (
    <>
      <HeroFilm
        /* Written as escapes: a literal non-breaking space in source is invisible. */
        eyebrow={`${profile?.discipline ?? ''} \u00a0/\u00a0 ${profile?.location ?? ''}`}
        name={firstName}
        surname={surname}
        intro={INTRO}
        ctaLabel="Architecture"
        ctaHref="/architecture"
        sources={{
          large: largest ? mediaUrl(largest) : null,
          small: smallest ? mediaUrl(smallest) : null,
        }}
        poster={hero?.poster ? posterUrl(hero.poster.key) : null}
      />

      <section aria-labelledby="works">
        <h2 className="section-title" id="works">
          Projects
        </h2>
        <ProjectGrid projects={projects} />
      </section>

      {/* About and the invitation sit side by side and share a row, so the page
          closes on one gesture rather than two stacked centred blocks. */}
      <section className="band closing">
        <div className="closing-grid">
          <Reveal className="closing-about">
            <h2 className="closing-heading">About</h2>
            <div className="closing-prose">
              {(profile?.longBio ?? []).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <p style={{ marginTop: '2rem' }}>
              <Link className="btn" href="/resume">
                Resume{' '}
                <span className="i" aria-hidden="true">
                  &rarr;
                </span>
              </Link>
            </p>
          </Reveal>

          <Reveal className="closing-contact">
            <p className="foot-kicker">Interested in collaborating?</p>
            <h2 className="closing-heading">Get in touch</h2>
            <ul className="closing-links">
              {email && (
                <li>
                  <a className="inline" href={`mailto:${email}`}>
                    {email}
                  </a>
                </li>
              )}
              {phone && (
                <li>
                  <a className="inline" href={telHref(phone)}>
                    {phone}
                  </a>
                </li>
              )}
              <li>
                <Link className="inline" href="/contact">
                  Contact page
                </Link>
              </li>
            </ul>
          </Reveal>
        </div>
      </section>
    </>
  );
}
