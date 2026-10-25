import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';

import Film from '@/components/site/Film';
import Reveal from '@/components/site/Reveal';
import { pageWords } from '@/components/site/pages/copy';
import { alternatesFor, openGraphFor } from '@/components/site/pages/metadata';
import { coverCaption, galleryWithoutCover } from '@/lib/cover-plate';
import { clampFocus, cropFrame, cropRect, croppedSrc, objectPosition, toRatio } from '@/lib/crop';
import { CATEGORY_WORDS, STATUS_WORDS, words } from '@/lib/dictionary';
import { localePath, type Locale } from '@/lib/i18n';
import { renderMarkdown } from '@/lib/markdown';
import { mediaUrl, posterUrl } from '@/lib/media-url';
import {
  getAdjacentProjects,
  getProfile,
  getProjectBySlug,
  getProjectSlugs,
  type ProjectDetail,
} from '@/lib/queries';

/**
 * One project, in whichever language it was asked for.
 *
 * /work/[slug] and /fr/work/[slug] both render this. The slug is the same in
 * both: an address is not translated, so the two pages are the same project at
 * two addresses rather than two projects.
 */

/* The database is empty until the migration runs, so the title still needs a
   name. The same default src/app/(site)/layout.tsx carries. */
const FALLBACK_NAME = 'Ahmad Assi';

/**
 * What the layout gives each figure, so the loader is asked for that width
 * rather than for the width of the master file. The gallery is two columns and
 * becomes one at 880px, and the drawing sheets are a single 70rem column.
 *
 * The cover takes the narrower half of the row it shares with the description,
 * a little under 40% of the window until the grid reaches its 72rem cap, and
 * the whole window once that row stacks.
 */
const STAGGER_SIZES = '(max-width: 880px) 100vw, 50vw';
const SHEET_SIZES = '(max-width: 70rem) 100vw, 70rem';
const COVER_SIZES = '(max-width: 880px) 100vw, (max-width: 68rem) 92vw, 62rem';

/**
 * Which project pages to prerender. Both languages call this, so both get every
 * published project rendered ahead of time rather than on first request.
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
export async function projectParams(): Promise<{ slug: string }[]> {
  const slugs = await getProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function workMetadata(locale: Locale, slug: string): Promise<Metadata> {
  /* The profile is read in English on purpose: the only thing taken from it
     here is the name, and a name is the same in both languages. */
  const [project, { profile }] = await Promise.all([
    getProjectBySlug(slug, locale),
    getProfile(),
  ]);

  /* The page itself calls notFound() for this, so the title only has to match
     what the 404 will actually show. */
  if (!project) return { title: `${pageWords(locale).pageNotFound}, ${FALLBACK_NAME}` };

  const title = `${project.title}, ${profile?.name ?? FALLBACK_NAME}`;

  return {
    title,
    description: project.summary,
    alternates: alternatesFor(locale, `/work/${project.slug}`),
    openGraph: openGraphFor(locale, title, project.summary),
  };
}

/** Only rows that have a value. An empty row is worse than no row. */
function facts(project: ProjectDetail, locale: Locale): [string, string][] {
  const w = words(locale);

  const rows: [string, string][] = [
    [w.projectType, project.buildingType],
    [w.location, project.location],
    // The enum cannot hold a space, so it is never shown raw.
    [w.status, STATUS_WORDS[locale][project.status] ?? project.status],
    [w.area, project.area ?? ''],
    [w.role, project.role],
  ];

  return rows.filter(([, value]) => value);
}

export default async function WorkPage({ locale, slug }: { locale: Locale; slug: string }) {
  const w = words(locale);
  const page = pageWords(locale);

  const project = await getProjectBySlug(slug, locale);
  if (!project) notFound();

  const adjacent = await getAdjacentProjects(slug, locale);

  const cover = project.leadImage;

  /* Every picture from every group, laid out as one run of figures. Each keeps
     its own caption: the group caption is deprecated and was copied down onto
     every picture under it, so a set of four no longer has to share a sentence
     Ahmad can only write once.

     The cover is left out. It sits across the page above now, and a cover
     nobody chose is the first picture of the first group, which is exactly the
     one that would otherwise appear twice. Its caption goes with it, under the
     cover plate, rather than being dropped along with the picture. */
  const gallery = galleryWithoutCover(cover, project.imageGroups);
  const captionUnderCover = coverCaption(cover, project.imageGroups);

  return (
    <>
      <section className="hero load">
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {/* Written as escapes: a literal non-breaking space in source is invisible. */}
          {`${CATEGORY_WORDS[locale][project.category] ?? project.category} \u00a0/\u00a0 `}
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
        {facts(project, locale).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </Reveal>

      {/* The one photograph that stands for the project, across the middle of
          the page between the sheet of facts and the writing. It sat beside the
          text for a while and read as a column of furniture next to a column of
          words; given the width of the page to itself it behaves like the plate
          it is. */}
      {cover && (
        <Reveal as="figure" className="cover-plate">
          <Image
            src={cover.key}
            alt={project.leadImageAlt}
            width={cover.width ?? 1600}
            height={cover.height ?? 1067}
            sizes={COVER_SIZES}
            priority
          />
          {captionUnderCover && <figcaption>{captionUnderCover}</figcaption>}
        </Reveal>
      )}

      <div className="band">
        {/* The body is markdown: headings, tables and emphasis all appear in
            the project text, and rendering it as plain paragraphs published the
            source. markdown-it runs with html off, so the only markup that
            reaches the page is markup it produced. */}
        <Reveal
          className="prose"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(project.body) }}
        />
      </div>

      {project.film && (
        <section className="band" aria-labelledby="film">
          <h2 className="section-title" id="film">
            {w.walkthrough}
          </h2>
          <Film
            sources={project.film.sources.map((source) => ({
              height: source.height,
              url: mediaUrl(source.media.key),
            }))}
            youtubeId={project.film.youtubeId}
            poster={project.film.poster ? posterUrl(project.film.poster.key) : ''}
            caption={project.film.caption}
            locale={locale}
          />
        </section>
      )}

      {/* Guarded, because the gallery can now come up empty: the cover has left
          it, and a project whose only picture was its cover would otherwise be
          a run of padding with nothing in it. */}
      {gallery.length > 0 && (
        <div className="stagger">
          {gallery.map((image) => {
            /* A picture cut to a shape is cut twice, to the same window. The
               loader asks Cloudflare to trim the full size master before the
               resize, which is what makes the crop cost no resolution; and the
               box here has the window's shape with the picture fitted to cover
               it, which shows the same window off the development server and
               any origin that hands back the whole file. */
            const ratio = toRatio(image.ratio);
            const focus = clampFocus({ x: image.focusX, y: image.focusY });
            const frame = cropFrame(image.media, ratio);
            const rect = cropRect(image.media, ratio, focus);
            return (
              <Reveal as="figure" key={image.id}>
                <Image
                  src={croppedSrc(image.media.key, rect)}
                  alt={image.alt}
                  width={frame.width}
                  height={frame.height}
                  sizes={STAGGER_SIZES}
                  style={
                    rect
                      ? {
                          aspectRatio: `${frame.width} / ${frame.height}`,
                          objectFit: 'cover',
                          objectPosition: objectPosition(focus),
                        }
                      : undefined
                  }
                />
                {image.caption && <figcaption>{image.caption}</figcaption>}
              </Reveal>
            );
          })}
        </div>
      )}

      {project.drawings.length > 0 && (
        <section className="band" aria-labelledby="drawings">
          <h2 className="section-title" id="drawings">
            {w.drawings}
          </h2>
          <div className="sheets">
            {project.drawings.map((drawing) => {
              const ratio = toRatio(drawing.ratio);
              const focus = clampFocus({ x: drawing.focusX, y: drawing.focusY });
              const frame = cropFrame(drawing.media, ratio);
              const rect = cropRect(drawing.media, ratio, focus);
              return (
                <Reveal as="figure" key={drawing.id}>
                  <Image
                    src={croppedSrc(drawing.media.key, rect)}
                    alt={drawing.alt}
                    width={frame.width}
                    height={frame.height}
                    sizes={SHEET_SIZES}
                    style={rect ? {
                      aspectRatio: `${frame.width} / ${frame.height}`,
                      objectFit: 'cover',
                      objectPosition: objectPosition(focus),
                    } : undefined}
                  />
                  <figcaption>{drawing.drawingType}</figcaption>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      {/* No pager on a site with one project: the previous and next links would
          both point back at the page being read. */}
      {adjacent && adjacent.prev.slug !== project.slug && (
        <nav className="pager" aria-label={page.otherProjects}>
          <Link href={localePath(locale, `/work/${adjacent.prev.slug}`)}>
            <span aria-hidden="true">&#8249;</span> {w.previous}
          </Link>
          <Link href={localePath(locale, `/work/${adjacent.next.slug}`)}>
            {w.next} <span aria-hidden="true">&#8250;</span>
          </Link>
        </nav>
      )}
    </>
  );
}
