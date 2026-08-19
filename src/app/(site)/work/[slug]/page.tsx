import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';

import Film from '@/components/site/Film';
import Reveal from '@/components/site/Reveal';
import { renderMarkdown } from '@/lib/markdown';
import { mediaUrl } from '@/lib/media-url';
import {
  getAdjacentProjects,
  getProfile,
  getProjectBySlug,
  getProjectSlugs,
  type ProjectDetail,
} from '@/lib/queries';
import { STATUS_LABELS } from '@/lib/validation';

/* The database is empty until the migration runs, so the title still needs a
   name. The same default src/app/layout.tsx carries. */
const FALLBACK_NAME = 'Ahmad Assi';

/**
 * What the layout gives each figure, so the loader is asked for that width
 * rather than for the width of the master file. The gallery is two columns and
 * becomes one at 880px, and the drawing sheets are a single 70rem column.
 */
const STAGGER_SIZES = '(max-width: 880px) 100vw, 50vw';
const SHEET_SIZES = '(max-width: 70rem) 100vw, 70rem';

interface WorkPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Every published project, prerendered. Replaces the Astro getStaticPaths.
 *
 * An empty list is not an error: it is what a database with nothing in it
 * returns, and dynamic parameters stay on, so a project published later is
 * rendered on demand rather than needing a rebuild.
 */
/**
 * Which project pages to prerender.
 *
 * No try block here, deliberately. An unreachable database has to fail the
 * build, loudly, at the first query. Catching it and returning an empty list
 * looks like resilience and is the opposite: the pages would render on demand
 * against a database that is still down, or worse, the statically rendered
 * pages that do not throw would publish and be cached in KV with no projects on
 * them. A deploy that quietly ships an empty portfolio is far more dangerous
 * than one that refuses to ship.
 *
 * scripts/check-database.mjs runs before the build and says this in a sentence,
 * rather than leaving a Prisma P1001 stack as the explanation.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await getProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: WorkPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [project, { profile }] = await Promise.all([getProjectBySlug(slug), getProfile()]);

  /* The page itself calls notFound() for this, so the title only has to match
     what the 404 will actually show. */
  if (!project) return { title: 'Page not found, Ahmad Assi' };

  const title = `${project.title}, ${profile?.name ?? FALLBACK_NAME}`;

  return {
    title,
    description: project.summary,
    alternates: { canonical: `/work/${project.slug}` },
    openGraph: { title, description: project.summary, type: 'website' },
  };
}

/** Only rows that have a value. An empty row is worse than no row. */
function facts(project: ProjectDetail): [string, string][] {
  const status = STATUS_LABELS[project.status as keyof typeof STATUS_LABELS] ?? project.status;

  const rows: [string, string][] = [
    ['Project type', project.buildingType],
    ['Location', project.location],
    // The enum cannot hold a space, so it is never shown raw.
    ['Status', status],
    ['Area', project.area ?? ''],
    ['Role', project.role],
  ];

  return rows.filter(([, value]) => value);
}

export default async function WorkPage({ params }: WorkPageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const adjacent = await getAdjacentProjects(slug);

  /* Every image from every group, each carrying the caption of the group it
     came from, so the gallery can be laid out as one run of figures. */
  const gallery = project.imageGroups.flatMap((group) =>
    group.images.map((image) => ({ ...image, caption: group.caption })),
  );

  return (
    <>
      <section className="hero load">
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {/* Written as escapes: a literal non-breaking space in source is invisible. */}
          {`${project.category} \u00a0/\u00a0 `}
          <em>{project.year}</em>
        </p>
        <h1 className="page-title" style={{ '--i': 1 } as CSSProperties}>
          {project.title}
        </h1>
        <p className="sub" style={{ '--i': 2 } as CSSProperties}>
          {project.summary}
        </p>
      </section>

      <Reveal as="dl" className="meta">
        {facts(project).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </Reveal>

      <div className="band">
        {/* The body is markdown: headings, tables and emphasis all appear in
            the eighteen project files, and rendering it as plain paragraphs
            published the source. markdown-it runs with html off, so the only
            markup that reaches the page is markup it produced. */}
        <Reveal
          className="prose"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(project.body) }}
        />
      </div>

      {project.film && (
        <section className="band" aria-labelledby="film">
          <h2 className="section-title" id="film">
            Walkthrough
          </h2>
          <Film
            sources={project.film.sources.map((source) => ({
              height: source.height,
              url: mediaUrl(source.media.key),
            }))}
            youtubeId={project.film.youtubeId}
            poster={project.film.poster ? mediaUrl(project.film.poster.key) : ''}
            caption={project.film.caption}
          />
        </section>
      )}

      <div className="stagger">
        {project.leadImage && (
          <Reveal as="figure">
            <Image
              src={project.leadImage.key}
              alt={project.leadImageAlt}
              width={project.leadImage.width ?? 1600}
              height={project.leadImage.height ?? 1067}
              sizes={STAGGER_SIZES}
            />
          </Reveal>
        )}
        {gallery.map((image) => (
          <Reveal as="figure" key={image.id}>
            <Image
              src={image.media.key}
              alt={image.alt}
              width={image.media.width ?? 1600}
              height={image.media.height ?? 1067}
              sizes={STAGGER_SIZES}
            />
            {image.caption && <figcaption>{image.caption}</figcaption>}
          </Reveal>
        ))}
      </div>

      {project.drawings.length > 0 && (
        <section className="band" aria-labelledby="drawings">
          <h2 className="section-title" id="drawings">
            Drawings
          </h2>
          <div className="sheets">
            {project.drawings.map((drawing) => (
              <Reveal as="figure" key={drawing.id}>
                <Image
                  src={drawing.media.key}
                  alt={drawing.alt}
                  width={drawing.media.width ?? 1600}
                  height={drawing.media.height ?? 1131}
                  sizes={SHEET_SIZES}
                />
                <figcaption>{drawing.drawingType}</figcaption>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* No pager on a site with one project: the previous and next links would
          both point back at the page being read. */}
      {adjacent && adjacent.prev.slug !== project.slug && (
        <nav className="pager" aria-label="Other projects">
          <Link href={`/work/${adjacent.prev.slug}`}>
            <span aria-hidden="true">&#8249;</span> Previous
          </Link>
          <Link href={`/work/${adjacent.next.slug}`}>
            Next <span aria-hidden="true">&#8250;</span>
          </Link>
        </nav>
      )}
    </>
  );
}
