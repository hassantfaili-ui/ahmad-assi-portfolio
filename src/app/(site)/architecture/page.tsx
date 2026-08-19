import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

import ProjectGrid from '@/components/site/ProjectGrid';
import { getProfile, getPublishedProjects } from '@/lib/queries';

/* The database is empty until the migration runs, so the title still needs a
   name. The same default src/app/layout.tsx carries. */
const FALLBACK_NAME = 'Ahmad Assi';

const DESCRIPTION =
  'Architectural and urbanism work by Ahmad Assi, including the Lincoln Beach Center and La Casa Aranas.';

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getProfile();
  const title = `Architecture, ${profile?.name ?? FALLBACK_NAME}`;

  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: '/architecture' },
    openGraph: { title, description: DESCRIPTION, type: 'website' },
  };
}

export default async function Architecture() {
  const projects = await getPublishedProjects();

  return (
    <>
      <section className="hero load">
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {/* Written as escapes: a literal non-breaking space in source is invisible. */}
          {'Architecture and urbanism \u00a0/\u00a0 '}
          <em>{`${projects.length} projects`}</em>
        </p>
        <h1 className="page-title" style={{ '--i': 1 } as CSSProperties}>
          Projects
        </h1>
        <p className="sub sub-line" style={{ '--i': 2 } as CSSProperties}>
          A selection of my work. Explore the projects to learn more about what I do.
        </p>
      </section>

      <ProjectGrid projects={projects} />
    </>
  );
}
