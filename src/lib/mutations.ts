'use server';

import { revalidatePath } from 'next/cache';

import { getIdentity } from '@/lib/access';
import { PATHS, profilePaths, projectPaths } from '@/lib/cache-tags';
import { CONTACT_DEFAULTS } from '@/lib/contact-defaults';
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

  /* Looked up first, so a row deleted in another tab comes back as a refusal
     rather than a thrown P2025. The caller keeps an optimistic copy of the list
     and puts it back when this returns ok: false, and that revert is dead code
     if the failure arrives as a rejection instead. */
  const existing = await db.project.findUnique({ where: { id }, select: { slug: true } });
  if (!existing) return { ok: false, message: 'That project no longer exists. Reload the page.' };

  await db.project.update({ where: { id }, data: { published } });

  revalidateProject(existing.slug);
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

  /* Filtered against what actually exists before the transaction is built. One
     id that has since been deleted, which is exactly the state after removing a
     project in a second tab, would otherwise abort the whole transaction: no
     project reordered at all, and a list left showing an order that was never
     written. */
  const live = await db.project.findMany({
    where: { id: { in: idsInOrder } },
    select: { id: true },
  });
  const known = new Set(live.map((project) => project.id));
  const usable = idsInOrder.filter((id) => known.has(id));

  if (usable.length === 0) {
    return { ok: false, message: 'None of those projects exist any more. Reload the page.' };
  }

  await db.$transaction(
    usable.map((id, index) => db.project.update({ where: { id }, data: { order: index + 1 } })),
  );

  revalidatePath(PATHS.home);
  revalidatePath(PATHS.architecture);
  revalidatePath(PATHS.print);

  const missing = idsInOrder.length - usable.length;
  return {
    ok: true,
    message: missing
      ? `The new order is saved. ${missing} ${missing === 1 ? 'project was' : 'projects were'} skipped because they no longer exist.`
      : undefined,
  };
}

export async function setProjectTier(
  id: string,
  tier: 'lead' | 'set' | 'index',
): Promise<SaveResult> {
  if (!(await authorised())) return DENIED;

  const existing = await db.project.findUnique({ where: { id }, select: { slug: true } });
  if (!existing) return { ok: false, message: 'That project no longer exists. Reload the page.' };

  await db.project.update({ where: { id }, data: { tier } });
  const leadCount = await db.project.count({ where: { tier: 'lead', published: true } });

  revalidateProject(existing.slug);

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

export interface DrawingInput {
  mediaId: string;
  alt: string;
  drawingType: string;
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


export interface WholeProjectInput {
  fields: ProjectInput;
  /** Whether the project is on the site, saved with everything else. */
  published: boolean;
  groups: GroupInput[];
  drawings: DrawingInput[];
  /** null means the project has no film, and any existing one is removed. */
  film: FilmInput | null;
}

/**
 * Save everything about a project at once.
 *
 * This replaces four separate saves, and the reason is a real failure rather
 * than tidiness. The editing screen had a button for the fields, one for the
 * pictures, one for the drawings and one for the film. Editing a group caption
 * and then pressing the obvious button at the top of the screen, the one
 * labelled Save the details, sent everything except the caption. The work was
 * never lost, exactly: it was never sent. That is worse, because nothing failed
 * and nothing warned.
 *
 * It is also atomic, which the four separate saves were not. Under those, a
 * refused picture save after an accepted field save left the project half
 * written, with the screen showing one state and the site another. Here, either
 * all of it lands or none of it does.
 *
 * Errors come back keyed the way the form expects: bare names for the fields,
 * and prefixed for the rest, so a missing description on the third picture of
 * the second group lands on that picture and not in a toast.
 */
export async function saveWholeProject(
  id: string,
  input: WholeProjectInput,
): Promise<SaveResult<{ slug: string }>> {
  if (!(await authorised())) return DENIED;

  const errors: FieldErrors = { ...validateProject(input.fields) };

  /* Namespaced, so two pictures in different groups cannot collide on
     images.0.alt and quietly show one error for both. */
  input.groups.forEach((group, groupIndex) => {
    const found = validateImages(group.images);
    for (const [key, message] of Object.entries(found)) {
      errors[`groups.${groupIndex}.${key}`] = message;
    }
  });

  input.drawings.forEach((drawing, index) => {
    if (!drawing.alt.trim()) {
      errors[`drawings.${index}.alt`] =
        'Alt text is required. It is what a screen reader announces.';
    }
  });

  if (input.film) {
    Object.assign(
      errors,
      validateFilm({
        sourceMediaIds: input.film.sources.map((source) => source.mediaId),
        youtubeId: input.film.youtubeId,
        posterMediaId: input.film.posterMediaId,
      }),
    );
  }

  if (hasErrors(errors)) return { ok: false, errors };

  const existing = await db.project.findUnique({ where: { id }, select: { slug: true } });
  if (!existing) return { ok: false, message: 'That project no longer exists.' };

  /* The slug is only recomputed when Ahmad actually edited it. A published URL
     is a promise, and renaming one because a title changed would break every
     link to it. */
  let slug = existing.slug;
  if (input.fields.slug.trim() && input.fields.slug.trim() !== existing.slug) {
    const taken = (
      await db.project.findMany({ where: { NOT: { id } }, select: { slug: true } })
    ).map((project) => project.slug);
    slug = uniqueSlug(toSlug(input.fields.slug), taken);
  }

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: {
        slug,
        title: input.fields.title.trim(),
        sheet: input.fields.sheet.trim(),
        category: input.fields.category as never,
        year: input.fields.year,
        location: input.fields.location.trim(),
        buildingType: input.fields.buildingType.trim(),
        area: input.fields.area?.trim() || null,
        status: input.fields.status as never,
        role: input.fields.role.trim(),
        contribution: input.fields.contribution.trim(),
        summary: input.fields.summary.trim(),
        body: (input.fields.body ?? '').trim(),
        credit: input.fields.credit.trim(),
        tier: input.fields.tier as never,
        order: input.fields.order,
        published: input.published,
        leadImageId: input.fields.leadImageId ?? null,
        leadImageAlt: input.fields.leadImageAlt ?? '',
      },
    });

    await tx.imageGroup.deleteMany({ where: { projectId: id } });
    for (const [groupIndex, group] of input.groups.entries()) {
      await tx.imageGroup.create({
        data: {
          projectId: id,
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
      });
    }

    await tx.drawing.deleteMany({ where: { projectId: id } });
    if (input.drawings.length > 0) {
      await tx.drawing.createMany({
        data: input.drawings.map((drawing, index) => ({
          projectId: id,
          mediaId: drawing.mediaId,
          alt: drawing.alt.trim(),
          drawingType: drawing.drawingType.trim() || 'Drawing',
          order: index,
        })),
      });
    }

    await tx.film.deleteMany({ where: { projectId: id } });
    if (input.film) {
      await tx.film.create({
        data: {
          projectId: id,
          posterMediaId: input.film.posterMediaId ?? null,
          youtubeId: input.film.youtubeId?.trim() || null,
          caption: input.film.caption?.trim() || null,
          sources: {
            create: input.film.sources.map((source) => ({
              mediaId: source.mediaId,
              height: source.height,
            })),
          },
        },
      });
    }
  });

  revalidateProject(existing.slug);
  if (slug !== existing.slug) revalidatePath(PATHS.project(slug));

  const leadCount = await db.project.count({ where: { tier: 'lead', published: true } });

  return { ok: true, data: { slug }, warning: leadOverflowWarning(leadCount) ?? undefined };
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
  contactStatus: string;
  contactHeading: string;
  contactBlurb: string;
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
    /* Blank falls back to what the page used to say rather than publishing an
       empty heading, because a contact page with no words on it is worse than
       one Ahmad has not got round to rewriting. */
    contactStatus: input.contactStatus.trim() || CONTACT_DEFAULTS.status,
    contactHeading: input.contactHeading.trim() || CONTACT_DEFAULTS.heading,
    contactBlurb: input.contactBlurb.trim() || CONTACT_DEFAULTS.blurb,
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

  /* One interactive transaction over the whole rewrite, skill groups included.
     They used to be created in a plain loop after the transaction committed,
     because createMany cannot express their nested items. That made the delete
     durable and the recreate unprotected: a single failure between the two, or
     a Worker killed mid request, left every skill group and every skill
     permanently gone, with the form still showing them and nothing saying so. */
  await db.$transaction(async (tx) => {
    await Promise.all([
      tx.fact.deleteMany({}),
      tx.socialLink.deleteMany({}),
      tx.experienceEntry.deleteMany({}),
      tx.educationEntry.deleteMany({}),
      tx.skillGroup.deleteMany({}),
      tx.language.deleteMany({}),
      tx.resumeEntry.deleteMany({}),
    ]);

    await tx.fact.createMany({
      data: lists.facts.map((fact, order) => ({
        label: fact.label.trim(),
        items: fact.items.map((item) => item.trim()).filter(Boolean),
        order,
      })),
    });

    await tx.socialLink.createMany({
      data: lists.social.map((link, order) => ({
        label: link.label.trim(),
        href: link.href.trim(),
        order,
      })),
    });

    await tx.experienceEntry.createMany({
      data: lists.experience.map((entry, order) => ({
        role: entry.role.trim(),
        firm: entry.firm.trim(),
        location: entry.location.trim(),
        period: entry.period.trim(),
        contributions: entry.contributions.map((line) => line.trim()).filter(Boolean),
        order,
      })),
    });

    await tx.educationEntry.createMany({
      data: lists.education.map((entry, order) => ({
        credential: entry.credential.trim(),
        institution: entry.institution.trim(),
        year: entry.year.trim(),
        note: entry.note?.trim() || null,
        order,
      })),
    });

    await tx.language.createMany({
      data: lists.languages
        .map((text, order) => ({ text: text.trim(), order }))
        .filter((language) => language.text),
    });

    await tx.resumeEntry.createMany({
      data: lists.entries.map((entry, order) => ({
        section: entry.section,
        title: entry.title.trim(),
        detail: entry.detail.trim(),
        year: entry.year.trim(),
        order,
      })),
    });

    // Inside the transaction with everything else. Each group writes its own
    // nested items, which createMany cannot express, so it is a loop rather
    // than one call. That is the only reason it looks different.
    for (const [order, group] of lists.skillGroups.entries()) {
      await tx.skillGroup.create({
        data: {
          label: group.label.trim(),
          order,
          items: {
            create: group.items
              .map((name, index) => ({ name: name.trim(), order: index }))
              .filter((item) => item.name),
          },
        },
      });
    }
  });

  revalidatePath(PATHS.resume);
  return { ok: true };
}
