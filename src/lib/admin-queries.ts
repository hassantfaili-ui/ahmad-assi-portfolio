import 'server-only';

import { getIdentity } from '@/lib/access';
import { db } from '@/lib/db';

/**
 * The reads the editing screens perform.
 *
 * EVERY function here refuses without an identity, and that is the real gate.
 *
 * The guard used to live only in the administration layout, which was necessary
 * and not sufficient: an RSC request for a page segment can render that page
 * without re-rendering its layout, so the check was simply skipped. Anonymous
 * requests to /admin/media/?_rsc came back with all 294 object keys in the
 * bucket, and /admin/resume/?_rsc with Ahmad's private email. Cloudflare Access
 * would have stopped those at the edge on the real domain, which is exactly the
 * comfort that let the hole sit there unnoticed.
 *
 * Putting it here means no routing path can get round it. A layout can be
 * skipped and a page can be added without its guard, but nothing reads this
 * data without going through these functions.
 *
 * Separate from src/lib/queries.ts because they answer a different question.
 * Those queries are what a visitor sees, so they filter to published work and
 * fetch only what a page renders. These are what Ahmad sees, so they include
 * unpublished projects, and they carry the counts and the usage information
 * that only matter when deciding whether something is safe to delete.
 */

/**
 * Refuse, loudly, if there is no identity.
 *
 * A throw rather than an empty result. Returning nothing would render an
 * editing screen that looks merely empty, which is indistinguishable from a
 * genuinely empty database and hides the failure. Reaching here without an
 * identity is a bug, and it should look like one.
 */
async function requireIdentity(): Promise<void> {
  const identity = await getIdentity();
  if (!identity) {
    throw new Error('The editing data was requested without a signed in identity.');
  }
}

const mediaSelect = {
  id: true,
  key: true,
  kind: true,
  contentType: true,
  bytes: true,
  width: true,
  height: true,
  durationSeconds: true,
  originalName: true,
  createdAt: true,
} as const;

export type AdminMedia = {
  id: string;
  key: string;
  kind: 'image' | 'video' | 'poster' | 'document';
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  originalName: string;
  createdAt: Date;
};

export type AdminProjectRow = {
  id: string;
  slug: string;
  title: string;
  year: number;
  tier: 'lead' | 'set' | 'index';
  order: number;
  published: boolean;
  credit: string;
  leadImage: AdminMedia | null;
  leadImageAlt: string;
  imageCount: number;
  drawingCount: number;
  hasFilm: boolean;
};

/** Every project, published or not, in running order. */
export async function listProjects(): Promise<AdminProjectRow[]> {
  await requireIdentity();
  const rows = await db.project.findMany({
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      year: true,
      tier: true,
      order: true,
      published: true,
      credit: true,
      leadImageAlt: true,
      leadImage: { select: mediaSelect },
      film: { select: { id: true } },
      drawings: { select: { id: true } },
      imageGroups: { select: { images: { select: { id: true } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    year: row.year,
    tier: row.tier as AdminProjectRow['tier'],
    order: row.order,
    published: row.published,
    credit: row.credit,
    leadImage: row.leadImage as AdminMedia | null,
    leadImageAlt: row.leadImageAlt,
    imageCount: row.imageGroups.reduce((total, group) => total + group.images.length, 0),
    drawingCount: row.drawings.length,
    hasFilm: Boolean(row.film),
  }));
}

/** One project with everything the editor needs, published or not. */
export async function getProjectForEditing(id: string) {
  await requireIdentity();
  return db.project.findUnique({
    where: { id },
    include: {
      leadImage: { select: mediaSelect },
      imageGroups: {
        orderBy: { order: 'asc' },
        include: {
          images: { orderBy: { order: 'asc' }, include: { media: { select: mediaSelect } } },
        },
      },
      drawings: { orderBy: { order: 'asc' }, include: { media: { select: mediaSelect } } },
      film: {
        include: {
          posterMedia: { select: mediaSelect },
          sources: { orderBy: { height: 'desc' }, include: { media: { select: mediaSelect } } },
        },
      },
    },
  });
}

export type MediaWithUsage = AdminMedia & {
  /** What still points at this file. Empty means it is safe to delete. */
  usedBy: string[];
};

/**
 * The whole library, with what uses each file.
 *
 * The usage list is computed here rather than left to the delete request,
 * because the answer has to be visible before Ahmad clicks: a delete that is
 * only refused after the fact teaches him to expect it to work.
 */
export async function listMedia(): Promise<MediaWithUsage[]> {
  await requireIdentity();
  const rows = await db.media.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      ...mediaSelect,
      leadFor: { select: { title: true } },
      projectImages: { select: { group: { select: { project: { select: { title: true } } } } } },
      drawings: { select: { project: { select: { title: true } } } },
      filmSources: { select: { film: { select: { project: { select: { title: true } } } } } },
      filmPosters: { select: { project: { select: { title: true } } } },
      profilePortrait: { select: { id: true } },
      profileCv: { select: { id: true } },
      profilePortfolio: { select: { id: true } },
    },
  });

  return rows.map((row) => {
    const usedBy = [
      ...row.leadFor.map((project) => `${project.title}, as its cover`),
      ...row.projectImages.map((image) => image.group.project.title),
      ...row.drawings.map((drawing) => `${drawing.project.title}, as a drawing`),
      ...row.filmSources.map((source) => source.film.project?.title ?? 'the site hero film'),
      ...row.filmPosters.map(
        (film) => `${film.project?.title ?? 'the site hero film'}, as its poster`,
      ),
      ...row.profilePortrait.map(() => 'your profile, as the portrait'),
      ...row.profileCv.map(() => 'your profile, as the resume PDF'),
      ...row.profilePortfolio.map(() => 'your profile, as the portfolio PDF'),
    ];

    return {
      id: row.id,
      key: row.key,
      kind: row.kind as AdminMedia['kind'],
      contentType: row.contentType,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      durationSeconds: row.durationSeconds,
      originalName: row.originalName,
      createdAt: row.createdAt,
      usedBy: [...new Set(usedBy)],
    };
  });
}

/** How many projects are marked lead, for the overflow warning. */
export async function countLeads(): Promise<number> {
  await requireIdentity();
  return db.project.count({ where: { tier: 'lead' } });
}
