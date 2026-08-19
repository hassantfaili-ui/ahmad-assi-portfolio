'use server';

import { revalidatePath } from 'next/cache';

import { getIdentity } from '@/lib/access';
import { PATHS, profilePaths, projectPaths } from '@/lib/cache-tags';
import { db } from '@/lib/db';
import { toSlug, uniqueSlug } from '@/lib/slug';
import {
  hasErrors,
  leadOverflowWarning,
  validateFilm,
  validateImages,
  validateProfile,
  validateProject,
  type FieldErrors,
  type ProjectInput,
} from '@/lib/validation';

/**
 * Every write the administration area performs.
 *
 * Two rules hold throughout.
 *
 * Each one checks the identity itself. The proxy and Cloudflare Access have
 * both already turned an unauthenticated request away, but a server action is
 * reachable by its own generated endpoint, and an authorisation check that
 * lives only in a matcher is a check somebody can move a route out from under.
 *
 * Each one regenerates what it touched, and only what it touched. Without that
 * a save changes nothing a visitor can see until the cache expires, which looks
 * exactly like the save not having worked. Regenerating everything on every
 * edit would throw away the whole site's rendered output to change one page.
 */

export interface SaveResult<T = void> {
  ok: boolean;
  errors?: FieldErrors;
  warning?: string;
  message?: string;
  data?: T;
}

async function authorised(): Promise<boolean> {
  return Boolean(await getIdentity());
}

const DENIED: SaveResult<never> = { ok: false, message: 'You are not signed in.' };

/** Everything a project edit could have changed. */
function revalidateProject(slug: string) {
  for (const path of projectPaths(slug)) revalidatePath(path);
}

// -------------------------------------------------------------- projects ---

export async function createProject(title: string): Promise<SaveResult<{ id: string; slug: string }>> {
  if (!(await authorised())) return DENIED;

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, errors: { title: 'Give the project a title to start with.' } };

  const taken = (await db.project.findMany({ select: { slug: true } })).map((p) => p.slug);
  const slug = uniqueSlug(toSlug(trimmed), taken);

  /* A new project starts unpublished. It has no images and no credit yet, and
     the schema's own rules would refuse it; appearing half finished on the
     public site the moment it is named would be worse than either. */
  const last = await db.project.aggregate({ _max: { order: true } });

  const project = await db.project.create({
    data: {
      slug,
      title: trimmed,
      sheet: 'A-101',
      category: 'Academic',
      year: new Date().getFullYear(),
      location: '',
      buildingType: '',
      status: 'Academic',
      role: '',
      contribution: '',
      summary: '',
      credit: '',
      tier: 'set',
      order: (last._max.order ?? 0) + 1,
      published: false,
    },
    select: { id: true, slug: true },
  });

  revalidatePath(PATHS.home);
  revalidatePath(PATHS.architecture);
  return { ok: true, data: project };
}

export async function saveProject(
  id: string,
  input: ProjectInput,
): Promise<SaveResult<{ slug: string }>> {
  if (!(await authorised())) return DENIED;

  const errors = validateProject(input);
  if (hasErrors(errors)) return { ok: false, errors };

  const existing = await db.project.findUnique({ where: { id }, select: { slug: true } });
  if (!existing) return { ok: false, message: 'That project no longer exists.' };

  /* The slug is only recomputed when Ahmad actually changed it. A published URL
     is a promise, and quietly renaming one because a title was corrected would
     break every link to it. */
  let slug = existing.slug;
  if (input.slug.trim() && input.slug.trim() !== existing.slug) {
    const taken = (
      await db.project.findMany({ where: { NOT: { id } }, select: { slug: true } })
    ).map((p) => p.slug);
    slug = uniqueSlug(toSlug(input.slug), taken);
  }

  await db.project.update({
    where: { id },
    data: {
      slug,
      title: input.title.trim(),
      sheet: input.sheet.trim(),
      category: input.category as never,
      year: input.year,
      location: input.location.trim(),
      buildingType: input.buildingType.trim(),
      area: input.area?.trim() || null,
      status: input.status as never,
      role: input.role.trim(),
      contribution: input.contribution.trim(),
      summary: input.summary.trim(),
      body: (input.body ?? '').trim(),
      credit: input.credit.trim(),
      tier: input.tier as never,
      order: input.order,
      leadImageId: input.leadImageId ?? null,
      leadImageAlt: input.leadImageAlt ?? '',
    },
  });

  revalidateProject(existing.slug);
  if (slug !== existing.slug) revalidatePath(PATHS.project(slug));

  const leadCount = await db.project.count({ where: { tier: 'lead', published: true } });

  return { ok: true, data: { slug }, warning: leadOverflowWarning(leadCount) ?? undefined };
}

export async function deleteProject(id: string): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  const project = await db.project.findUnique({ where: { id }, select: { slug: true } });
  if (!project) return { ok: false, message: 'That project no longer exists.' };

  /* The rows go, the files stay. Groups, images, drawings and the film cascade
     from the schema, but Media does not: deleting a project must never remove a
     photograph that another project also shows. Tidying the library is a
     separate, deliberate act with its own reference check. */
  await db.project.delete({ where: { id } });

  revalidateProject(project.slug);
  return { ok: true, message: 'Project deleted. The files it used are still in the library.' };
}

export async function setProjectPublished(id: string, published: boolean): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  const project = await db.project.update({
    where: { id },
    data: { published },
    select: { slug: true },
  });

  revalidateProject(project.slug);
  return { ok: true };
}

/**
 * Write a whole new running order in one transaction.
 *
 * All of them, not just the pair that swapped. Writing only the moved rows
 * leaves the rest holding whatever they had, and since `order` defaults to 99
 * for every new project that is frequently the same number several times over.
 * Rewriting the sequence from the top is the only version that cannot drift.
 */
export async function reorderProjects(idsInOrder: string[]): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  await db.$transaction(
    idsInOrder.map((id, index) =>
      db.project.update({ where: { id }, data: { order: index + 1 } }),
    ),
  );

  revalidatePath(PATHS.home);
  revalidatePath(PATHS.architecture);
  revalidatePath(PATHS.print);
  return { ok: true };
}

export async function setProjectTier(
  id: string,
  tier: 'lead' | 'set' | 'index',
): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  const project = await db.project.update({ where: { id }, data: { tier }, select: { slug: true } });
  const leadCount = await db.project.count({ where: { tier: 'lead', published: true } });

  revalidateProject(project.slug);

  /* Said out loud rather than left to be discovered. tiers() already makes sure
     a fourth lead falls through into the strip instead of vanishing, which is
     the important half. This is the half that stops Ahmad wondering why the
     project he just promoted did not move. */
  return { ok: true, warning: leadOverflowWarning(leadCount) ?? undefined };
}

// ----------------------------------------------------------------- media ---

export interface GroupInput {
  layout: 'pair' | 'full' | 'triptych';
  caption?: string | null;
  images: { mediaId: string; alt: string }[];
}

/**
 * Replace a project's whole image arrangement.
 *
 * Wholesale rather than a diff. The arrangement is what the form holds, groups
 * and images are cheap rows, and a diff over two nested ordered lists is a
 * quantity of code whose only purpose would be to avoid writing a hundred rows
 * that Postgres writes in a millisecond. The files themselves are untouched.
 */
export async function saveImageGroups(
  projectId: string,
  groups: GroupInput[],
): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  const errors = validateImages(groups.flatMap((group) => group.images));
  if (hasErrors(errors)) return { ok: false, errors };

  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  if (!project) return { ok: false, message: 'That project no longer exists.' };

  await db.$transaction([
    db.imageGroup.deleteMany({ where: { projectId } }),
    ...groups.map((group, groupIndex) =>
      db.imageGroup.create({
        data: {
          projectId,
          layout: group.layout,
          caption: group.caption?.trim() || null,
          order: groupIndex,
          images: {
            create: group.images.map((image, imageIndex) => ({
              mediaId: image.mediaId,
              alt: image.alt.trim(),
              order: imageIndex,
            })),
          },
        },
      }),
    ),
  ]);

  revalidateProject(project.slug);
  return { ok: true };
}

export interface DrawingInput {
  mediaId: string;
  alt: string;
  drawingType: string;
}

export async function saveDrawings(
  projectId: string,
  drawings: DrawingInput[],
): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  const errors = validateImages(drawings);
  if (hasErrors(errors)) return { ok: false, errors };

  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  if (!project) return { ok: false, message: 'That project no longer exists.' };

  await db.$transaction([
    db.drawing.deleteMany({ where: { projectId } }),
    ...drawings.map((drawing, index) =>
      db.drawing.create({
        data: {
          projectId,
          mediaId: drawing.mediaId,
          alt: drawing.alt.trim(),
          drawingType: drawing.drawingType.trim() || 'Drawing',
          order: index,
        },
      }),
    ),
  ]);

  revalidateProject(project.slug);
  return { ok: true };
}

export interface FilmInput {
  posterMediaId?: string | null;
  youtubeId?: string | null;
  caption?: string | null;
  sources: { mediaId: string; height: number }[];
}

/** projectId null is the site hero film. */
export async function saveFilm(projectId: string | null, input: FilmInput): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  const errors = validateFilm({
    sourceMediaIds: input.sources.map((source) => source.mediaId),
    youtubeId: input.youtubeId,
    posterMediaId: input.posterMediaId,
  });
  if (hasErrors(errors)) return { ok: false, errors };

  await db.$transaction([
    db.film.deleteMany({ where: { projectId } }),
    db.film.create({
      data: {
        projectId,
        posterMediaId: input.posterMediaId ?? null,
        youtubeId: input.youtubeId?.trim() || null,
        caption: input.caption?.trim() || null,
        sources: {
          create: input.sources.map((source) => ({
            mediaId: source.mediaId,
            height: source.height,
          })),
        },
      },
    }),
  ]);

  if (projectId === null) {
    revalidatePath(PATHS.home);
  } else {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
    if (project) revalidateProject(project.slug);
  }

  return { ok: true };
}

export async function deleteFilm(projectId: string | null): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  await db.film.deleteMany({ where: { projectId } });

  if (projectId === null) {
    revalidatePath(PATHS.home);
  } else {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
    if (project) revalidateProject(project.slug);
  }

  return { ok: true };
}

// ---------------------------------------------------------------- resume ---

export interface ProfileInput {
  name: string;
  discipline: string;
  credential: string;
  registration: string;
  location: string;
  yearsExperience: string;
  availability: string;
  issued: string;
  welcome: string;
  positioning: string;
  longBio: string[];
  portraitMediaId?: string | null;
  portraitAlt?: string;
  cvMediaId?: string | null;
  portfolioMediaId?: string | null;
  email: string;
  phone: string;
  references: string;
}

export async function saveProfile(input: ProfileInput): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  const errors = validateProfile(input);
  if (hasErrors(errors)) return { ok: false, errors };

  const fields = {
    name: input.name.trim(),
    discipline: input.discipline.trim(),
    credential: input.credential.trim(),
    registration: input.registration.trim(),
    location: input.location.trim(),
    yearsExperience: input.yearsExperience.trim(),
    availability: input.availability.trim(),
    issued: input.issued.trim(),
    welcome: input.welcome.trim(),
    positioning: input.positioning.trim(),
    longBio: input.longBio.map((p) => p.trim()).filter(Boolean),
    portraitMediaId: input.portraitMediaId ?? null,
    portraitAlt: input.portraitAlt?.trim() ?? '',
    cvMediaId: input.cvMediaId ?? null,
    portfolioMediaId: input.portfolioMediaId ?? null,
    email: input.email.trim(),
    phone: input.phone.trim(),
    references: input.references.trim() || 'Available upon request',
  };

  await db.profile.upsert({
    where: { id: 'profile' },
    update: fields,
    create: { id: 'profile', ...fields },
  });

  /* The profile is in the header and the footer of every page, so this is the
     one write that legitimately regenerates the whole site. */
  for (const path of profilePaths()) revalidatePath(path);
  return { ok: true };
}

export interface ResumeLists {
  facts: { label: string; items: string[] }[];
  social: { label: string; href: string }[];
  experience: { role: string; firm: string; location: string; period: string; contributions: string[] }[];
  education: { credential: string; institution: string; year: string; note?: string | null }[];
  skillGroups: { label: string; items: string[] }[];
  languages: string[];
  entries: {
    section: 'volunteering' | 'awards' | 'publications' | 'exhibitions';
    title: string;
    detail: string;
    year: string;
  }[];
}

/**
 * Rewrite the resume lists wholesale, in one transaction.
 *
 * Same reasoning as the image groups. These are short ordered lists edited as a
 * unit in one form, and a diff would be more code than the thing it saves.
 */
export async function saveResumeLists(lists: ResumeLists): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  await db.$transaction([
    db.fact.deleteMany({}),
    db.socialLink.deleteMany({}),
    db.experienceEntry.deleteMany({}),
    db.educationEntry.deleteMany({}),
    db.skillGroup.deleteMany({}),
    db.language.deleteMany({}),
    db.resumeEntry.deleteMany({}),

    db.fact.createMany({
      data: lists.facts.map((fact, order) => ({
        label: fact.label.trim(),
        items: fact.items.map((i) => i.trim()).filter(Boolean),
        order,
      })),
    }),
    db.socialLink.createMany({
      data: lists.social.map((link, order) => ({
        label: link.label.trim(),
        href: link.href.trim(),
        order,
      })),
    }),
    db.experienceEntry.createMany({
      data: lists.experience.map((entry, order) => ({
        role: entry.role.trim(),
        firm: entry.firm.trim(),
        location: entry.location.trim(),
        period: entry.period.trim(),
        contributions: entry.contributions.map((c) => c.trim()).filter(Boolean),
        order,
      })),
    }),
    db.educationEntry.createMany({
      data: lists.education.map((entry, order) => ({
        credential: entry.credential.trim(),
        institution: entry.institution.trim(),
        year: entry.year.trim(),
        note: entry.note?.trim() || null,
        order,
      })),
    }),
    db.language.createMany({
      data: lists.languages.map((text, order) => ({ text: text.trim(), order })).filter((l) => l.text),
    }),
    db.resumeEntry.createMany({
      data: lists.entries.map((entry, order) => ({
        section: entry.section,
        title: entry.title.trim(),
        detail: entry.detail.trim(),
        year: entry.year.trim(),
        order,
      })),
    }),
  ]);

  /* Skill groups are created outside the transaction list above because each one
     writes its own nested items, which createMany cannot express. */
  for (const [order, group] of lists.skillGroups.entries()) {
    await db.skillGroup.create({
      data: {
        label: group.label.trim(),
        order,
        items: {
          create: group.items
            .map((name, i) => ({ name: name.trim(), order: i }))
            .filter((item) => item.name),
        },
      },
    });
  }

  revalidatePath(PATHS.resume);
  return { ok: true };
}
