import 'server-only';

import { db } from '@/lib/db';

/**
 * Every read the public site performs.
 *
 * Deliberately unwrapped by any data cache. The pages that call these are
 * statically rendered and held as HTML in KV through the OpenNext incremental
 * cache, so a visitor never reaches this code at all: a render only happens
 * when a page is first requested or when a save revalidates its path. Caching
 * the queries underneath that would be a second cache layer guarding something
 * already cached, with its own invalidation to keep in step.
 *
 * That layer was tried and removed. Next 16 changed revalidateTag to require a
 * cacheLife profile and introduced updateTag for the "use cache" world, while
 * unstable_cache belongs to the older tag manifest, and betting on the two
 * interoperating is not worth what it would buy here. Path revalidation is one
 * mechanism instead of two, and it is the one that decides what a visitor
 * actually sees.
 */

// ------------------------------------------------------------- selections ---

const mediaSelect = {
  id: true,
  key: true,
  width: true,
  height: true,
  bytes: true,
  contentType: true,
  durationSeconds: true,
} as const;

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  category: true,
  year: true,
  location: true,
  buildingType: true,
  summary: true,
  status: true,
  role: true,
  credit: true,
  tier: true,
  order: true,
  leadImageAlt: true,
  leadImage: { select: mediaSelect },
} as const;

const filmInclude = {
  posterMedia: { select: mediaSelect },
  sources: {
    select: { height: true, media: { select: mediaSelect } },
    orderBy: { height: 'desc' },
  },
} as const;

// ------------------------------------------------------------------ types ---

export type MediaRef = {
  id: string;
  key: string;
  width: number | null;
  height: number | null;
  bytes: number;
  contentType: string;
  durationSeconds: number | null;
};

export type ProjectSummary = {
  id: string;
  slug: string;
  title: string;
  category: string;
  year: number;
  location: string;
  buildingType: string;
  summary: string;
  status: string;
  role: string;
  credit: string;
  tier: 'lead' | 'set' | 'index';
  order: number;
  leadImageAlt: string;
  leadImage: MediaRef | null;
};

export type FilmView = {
  youtubeId: string | null;
  caption: string | null;
  poster: MediaRef | null;
  sources: { height: number; media: MediaRef }[];
};

export type ProjectDetail = ProjectSummary & {
  sheet: string;
  area: string | null;
  contribution: string;
  body: string;
  film: FilmView | null;
  imageGroups: {
    id: string;
    layout: 'pair' | 'full' | 'triptych';
    caption: string | null;
    images: { id: string; alt: string; media: MediaRef }[];
  }[];
  drawings: { id: string; alt: string; drawingType: string; media: MediaRef }[];
};

// ---------------------------------------------------------------- queries ---

export async function getPublishedProjects(): Promise<ProjectSummary[]> {
  const rows = await db.project.findMany({
    where: { published: true },
    select: summarySelect,
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  return rows as unknown as ProjectSummary[];
}

export async function getProjectSlugs(): Promise<string[]> {
  const rows = await db.project.findMany({
    where: { published: true },
    select: { slug: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => row.slug);
}

export async function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
  const row = await db.project.findFirst({
    where: { slug, published: true },
    select: {
      ...summarySelect,
      sheet: true,
      area: true,
      contribution: true,
      body: true,
      film: { select: filmInclude },
      imageGroups: {
        select: {
          id: true,
          layout: true,
          caption: true,
          images: {
            select: { id: true, alt: true, media: { select: mediaSelect } },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      },
      drawings: {
        select: { id: true, alt: true, drawingType: true, media: { select: mediaSelect } },
        orderBy: { order: 'asc' },
      },
    },
  });
  return row as unknown as ProjectDetail | null;
}

/**
 * The previous and next project, wrapping around at both ends.
 *
 * Wrapping is what the Astro build did with a modulo over the sorted list, and
 * it is the right behaviour: the pager exists to browse the whole set, so a dead
 * end at either end is a worse answer than looping.
 */
export async function getAdjacentProjects(
  slug: string,
): Promise<{ prev: ProjectSummary; next: ProjectSummary } | null> {
  const projects = await getPublishedProjects();
  if (projects.length === 0) return null;

  const index = projects.findIndex((project) => project.slug === slug);
  if (index === -1) return null;

  const count = projects.length;
  return {
    prev: projects[(index - 1 + count) % count],
    next: projects[(index + 1) % count],
  };
}

export type ProfileView = Awaited<ReturnType<typeof getProfile>>;

export async function getProfile() {
  const [profile, facts, social, experience, education, skillGroups, languages, entries] =
    await Promise.all([
      db.profile.findUnique({
        where: { id: 'profile' },
        include: {
          portraitMedia: { select: mediaSelect },
          cvMedia: { select: mediaSelect },
          portfolioMedia: { select: mediaSelect },
        },
      }),
      db.fact.findMany({ orderBy: { order: 'asc' } }),
      db.socialLink.findMany({ orderBy: { order: 'asc' } }),
      db.experienceEntry.findMany({ orderBy: { order: 'asc' } }),
      db.educationEntry.findMany({ orderBy: { order: 'asc' } }),
      db.skillGroup.findMany({
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } },
      }),
      db.language.findMany({ orderBy: { order: 'asc' } }),
      db.resumeEntry.findMany({ orderBy: [{ section: 'asc' }, { order: 'asc' }] }),
    ]);

  return { profile, facts, social, experience, education, skillGroups, languages, entries };
}

/** The site hero film is the one Film row with no project attached. */
export async function getHeroFilm(): Promise<FilmView | null> {
  const row = await db.film.findFirst({
    where: { projectId: null },
    select: filmInclude,
  });
  return row as unknown as FilmView | null;
}
