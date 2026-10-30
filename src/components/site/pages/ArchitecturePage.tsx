import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

import ProjectGrid from '@/components/site/ProjectGrid';
import { architectureDescription, pageWords, projectCount } from '@/components/site/pages/copy';
import { alternatesFor, openGraphFor } from '@/components/site/pages/metadata';
import { words } from '@/lib/dictionary';
import type { Locale } from '@/lib/i18n';
import { getProfile, getPublishedProjects } from '@/lib/queries';

/**
 * The portfolio page, in whichever language it was asked for.
 *
 * /architecture and /fr/architecture both render this. The name in the title
 * comes off the profile and is not translated; the description around it is.
 */

/* The database is empty until the migration runs, so the title still needs a
   name. The same default src/app/(site)/layout.tsx carries. */
const FALLBACK_NAME = 'Ahmad Assi';

export async function architectureMetadata(locale: Locale): Promise<Metadata> {
  /* English, and deliberately: the only thing taken from the profile here is
     the name, and a name is the same in both languages. Asking for the French
     bundle would be nine lookups for a word none of them can change. */
  const { profile } = await getProfile();

  const name = profile?.name ?? FALLBACK_NAME;
  const title = `${words(locale).architecture}, ${name}`;
  const description = architectureDescription(locale, name);

  return {
    title,
    description,
    alternates: alternatesFor(locale, '/architecture'),
    openGraph: openGraphFor(locale, title, description),
  };
}

export default async function ArchitecturePage({ locale }: { locale: Locale }) {
  const page = pageWords(locale);
  const projects = await getPublishedProjects(locale);

  return (
    <>
      <section className="hero load">
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {/* Written as escapes: a literal non-breaking space in source is invisible. */}
          {`${page.architectureAndUrbanism} \u00a0/\u00a0 `}
          <em>{projectCount(locale, projects.length)}</em>
        </p>
        <h1 className="page-title" style={{ '--i': 1 } as CSSProperties}>
          {page.projects}
        </h1>
        <p className="sub sub-line" style={{ '--i': 2 } as CSSProperties}>
          {page.projectsIntro}
        </p>
      </section>

      <ProjectGrid projects={projects} locale={locale} />
    </>
  );
}
