import 'server-only';

import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import { TAGS } from '@/lib/cache-tags';

/**
 * Every read the public site performs.
 *
 * Each one is wrapped in unstable_cache and tagged, so a save in the
 * administration area can invalidate exactly what it changed. Without that
 * every visitor causes a database query, and with a coarser tag every save
 * throws away the whole site's cache.
 *
 * unstable_cache rather than the "use cache" directive on purpose: "use cache"
 * needs the cacheComponents flag, which is still experimental, and this has to
 * deploy reliably to Workers through OpenNext. The migration between them is
 * mechanical if that changes.
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

export const getPublishedProjects = unstable_cache(
  async (): Promise<ProjectSummary[]> => {
    const rows = await db.project.findMany({
      where: { published: true },
      select: summarySelect,
      orderBy: { order: 'asc' },
    });
    return rows as unknown as ProjectSummary[];
  },
  ['published-projects'],
  { tags: [TAGS.projects] },
);

export const getProjectSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db.project.findMany({
      where: { published: true },
      select: { slug: true },
      orderBy: { order: 'asc' },
    });
    return rows.map((r) => r.slug);
  },
  ['project-slugs'],
  { tags: [TAGS.projects] },
);

export async function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
  const load = unstable_cache(
    async (s: string) => {
      const row = await db.project.findFirst({
        where: { slug: s, published: true },
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
    },
    ['project-by-slug', slug],
    { tags: [TAGS.project(slug), TAGS.projects] },
  );
  return load(slug);
}

/**
 * The previous and next project, wrapping around at both ends.
 *
 * Wrapping is what the Astro build did with a modulo over the sorted list, and
 * it is the right behaviour: the pager is a way to browse the whole set, so a
 * dead end at either end is a worse answer than looping.
 */
export async function getAdjacentProjects(
  slug: string,
): Promise<{ prev: ProjectSummary; next: ProjectSummary } | null> {
  const projects = await getPublishedProjects();
  if (projects.length === 0) return null;

  const index = projects.findIndex((p) => p.slug === slug);
  if (index === -1) return null;

  const count = projects.length;
  return {
    prev: projects[(index - 1 + count) % count],
    next: projects[(index + 1) % count],
  };
}

export type ProfileView = Awaited<ReturnType<typeof loadProfile>>;

async function loadProfile() {
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

export const getProfile = unstable_cache(loadProfile, ['profile'], { tags: [TAGS.profile] });

/** The site hero film is the one Film row with no project attached. */
export const getHeroFilm = unstable_cache(
  async (): Promise<FilmView | null> => {
    const row = await db.film.findFirst({
      where: { projectId: null },
      select: filmInclude,
    });
    return row as unknown as FilmView | null;
  },
  ['hero-film'],
  { tags: [TAGS.hero] },
);
