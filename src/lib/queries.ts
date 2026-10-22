import 'server-only';

import { db } from '@/lib/db';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n';
import { pictureKey } from '@/lib/translate';
import {
  applyTranslation,
  overlay,
  translationsFor,
  type ModelTranslations,
  type RowTranslations,
} from '@/lib/translations';

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
 *
 * Every query that returns words a visitor reads takes a locale, and it
 * defaults to English. English is the record itself, so the English path is the
 * query it always was and nothing else happens on it. French fetches exactly
 * the same rows and lays the translations over them afterwards, one lookup per
 * model per page. That way there is one set of queries for both languages, and
 * the English shows through wherever the French has not been written yet.
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

/**
 * Every field a film needs on the page.
 *
 * youtubeId and caption are here because they were once missing and nothing
 * caught it: FilmView declared them, the select did not fetch them, and an
 * `as unknown as` cast in between told the compiler not to look. The caption
 * under the Lincoln Beach walkthrough silently disappeared and both posters
 * rendered empty. The casts are gone now, so this shape is checked.
 */
const filmInclude = {
  youtubeId: true,
  caption: true,
  posterMedia: { select: mediaSelect },
  sources: {
    select: { height: true, media: { select: mediaSelect } },
    orderBy: { height: 'desc' },
  },
} as const;

type FilmRow = {
  youtubeId: string | null;
  caption: string | null;
  posterMedia: MediaRef | null;
  sources: { height: number; media: MediaRef }[];
};

/** posterMedia is the column, poster is what the page reads. */
function toFilmView(row: FilmRow | null): FilmView | null {
  if (!row) return null;
  return {
    youtubeId: row.youtubeId,
    caption: row.caption,
    poster: row.posterMedia,
    sources: row.sources,
  };
}

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
    images: {
      id: string;
      alt: string;
      caption: string | null;
      /** The shape the picture is cut to, or null for its own. See src/lib/crop.ts. */
      ratio: string | null;
      focusX: number;
      focusY: number;
      media: MediaRef;
    }[];
  }[];
  drawings: { id: string; alt: string; drawingType: string; media: MediaRef }[];
};

// ------------------------------------------------------------- paragraphs ---

/**
 * A list of paragraphs, said in another language.
 *
 * Three of the fields worth translating are lists rather than single sentences:
 * the About block, the lines under each "At a glance" heading, and what Ahmad
 * did at each firm. A translation is one piece of text, so a list is stored as
 * its paragraphs with a blank line between them, which is how a person types
 * them into a box anyway, and read back by splitting on that blank line.
 *
 * One translation for the whole list rather than one per paragraph, so a list
 * Ahmad has not reached yet falls back to the English entire. Held paragraph by
 * paragraph, a list could come back with its first sentence in French and the
 * rest of it missing, which reads worse than either language on its own.
 */
const PARAGRAPH_BREAK = '\n\n';

/** How a list of paragraphs is written into a translation. */
export function joinParagraphs(items: readonly string[]): string {
  return items.join(PARAGRAPH_BREAK);
}

/** And how it comes back out. Blank lines a translator left behind are dropped. */
export function splitParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * The list fields of one row, laid over it.
 *
 * The core's applyTranslation puts a string where a string was, which is right
 * for every other field and wrong for these three, since a page that walks
 * longBio would find itself walking the characters of one long sentence. A list
 * that splits to nothing is left alone, so the English survives a translation
 * that turned out to be only whitespace.
 */
function applyLists<T extends Record<string, unknown>>(
  row: T,
  fields: readonly (keyof T & string)[],
  translations: RowTranslations | undefined,
): T {
  if (!translations) return row;

  let changed = false;
  const next: Record<string, unknown> = { ...row };
  for (const field of fields) {
    const paragraphs = splitParagraphs(translations[field] ?? '');
    if (paragraphs.length > 0) {
      next[field] = paragraphs;
      changed = true;
    }
  }

  return changed ? (next as T) : row;
}

/** One row's sentences and its lists together. */
function translateRow<T extends Record<string, unknown>>(
  row: T,
  fields: readonly (keyof T & string)[],
  lists: readonly (keyof T & string)[],
  translations: RowTranslations | undefined,
): T {
  return applyLists(applyTranslation(row, fields, translations), lists, translations);
}

/** The same, for rows that each carry their own id. */
function translateRows<T extends { id: string } & Record<string, unknown>>(
  rows: T[],
  fields: readonly (keyof T & string)[],
  lists: readonly (keyof T & string)[],
  translations: ModelTranslations,
): T[] {
  if (translations.size === 0) return rows;
  return rows.map((row) => translateRow(row, fields, lists, translations.get(row.id)));
}

const idsOf = (rows: readonly { id: string }[]): string[] => rows.map((row) => row.id);

/**
 * What a row's French is filed under.
 *
 * Usually the row's own id, which is what the core's `overlay` assumes. That
 * holds for a project and for the profile, since both are updated in place.
 *
 * It does not hold for the pictures, the drawings or a film. Saving a project
 * deletes those rows and writes them again, so their ids are new after every
 * press, and French filed under an id would be orphaned the first time Ahmad
 * touched anything. The core's pictureKey names a picture by the project it is
 * in and the file it shows, which is what actually identifies it, and
 * mutations.ts clears them under the same name when a project is deleted. A
 * film is named by the project it belongs to, or by the place on the site it
 * plays in, since a project has only one and a slot holds only one.
 *
 * The resume lists are read under their own ids, and that asks something of
 * the writer in return: a resume save has to keep them. It rewrites those rows
 * wholesale today, and fresh ids would leave every French sentence on the
 * resume pointing at rows that no longer exist, with nothing failing, nothing
 * logged, and the page quietly back in English.
 */
function overlayBy<T extends Record<string, unknown>>(
  rows: T[],
  fields: readonly (keyof T & string)[],
  translations: ModelTranslations,
  nameOf: (row: T) => string,
): T[] {
  if (translations.size === 0) return rows;
  return rows.map((row) => applyTranslation(row, fields, translations.get(nameOf(row))));
}

// ------------------------------------------------------------ translation ---

/**
 * What is worth saying in French, model by model.
 *
 * Only the words a visitor reads. A slug is an address rather than a sentence,
 * and the French page of a project keeps the English one, so a project has one
 * address in both languages and nothing printed on a resume or held in an index
 * goes dead. A sheet number is a drawing number, and A-101 is A-101 either way.
 * So are a name, an email address and a telephone number.
 *
 * A field is translatable because it appears here, so this is the whole answer
 * to what Ahmad can put into French.
 */
const PROJECT_SUMMARY_FIELDS = [
  'title',
  'location',
  'buildingType',
  'summary',
  'role',
  'credit',
  'leadImageAlt',
] as const;

const PROJECT_DETAIL_FIELDS = [...PROJECT_SUMMARY_FIELDS, 'area', 'contribution', 'body'] as const;

const PROJECT_IMAGE_FIELDS = ['alt', 'caption'] as const;
const DRAWING_FIELDS = ['alt', 'drawingType'] as const;
const FILM_FIELDS = ['caption'] as const;

const PROFILE_FIELDS = [
  'discipline',
  'credential',
  'registration',
  'location',
  'yearsExperience',
  'availability',
  'issued',
  'welcome',
  'positioning',
  'portraitAlt',
  'references',
  'contactStatus',
  'contactHeading',
  'contactBlurb',
] as const;
const PROFILE_LISTS = ['longBio'] as const;

const FACT_FIELDS = ['label'] as const;
const FACT_LISTS = ['items'] as const;
const SOCIAL_FIELDS = ['label'] as const;
const EXPERIENCE_FIELDS = ['role', 'location', 'period'] as const;
const EXPERIENCE_LISTS = ['contributions'] as const;
const EDUCATION_FIELDS = ['credential', 'institution', 'note'] as const;
const SKILL_GROUP_FIELDS = ['label'] as const;
const SKILL_FIELDS = ['name'] as const;
const LANGUAGE_FIELDS = ['text'] as const;
const RESUME_ENTRY_FIELDS = ['title', 'detail'] as const;

// ---------------------------------------------------------------- queries ---

export async function getPublishedProjects(
  locale: Locale = DEFAULT_LOCALE,
): Promise<ProjectSummary[]> {
  const rows = await db.project.findMany({
    where: { published: true },
    select: summarySelect,
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  const projects = rows as unknown as ProjectSummary[];
  if (locale === DEFAULT_LOCALE) return projects;

  const french = await translationsFor(locale, 'Project', idsOf(projects));
  return overlay(projects, PROJECT_SUMMARY_FIELDS, french);
}

export async function getProjectSlugs(): Promise<string[]> {
  const rows = await db.project.findMany({
    where: { published: true },
    select: { slug: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => row.slug);
}

/**
 * A project and everything on its page.
 *
 * Found by its English slug in both languages, because that is the one address
 * the project has. In French the four models the page shows are looked up in
 * four queries rather than one per picture: a project with fifteen photographs,
 * six drawings and a film would otherwise be twenty three round trips over
 * Hyperdrive for a page that is otherwise one.
 */
export async function getProjectBySlug(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<ProjectDetail | null> {
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
            select: {
              id: true,
              alt: true,
              caption: true,
              ratio: true,
              focusX: true,
              focusY: true,
              media: { select: mediaSelect },
            },
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
  if (!row) return null;

  const { film, ...rest } = row as unknown as Omit<ProjectDetail, 'film'> & { film: FilmRow | null };
  if (locale === DEFAULT_LOCALE) return { ...rest, film: toFilmView(film) };

  /* A picture and a drawing are both named by this project and the file shown. */
  const nameOf = (shown: { media: MediaRef }) => pictureKey(rest.id, shown.media.id);
  const pictures = rest.imageGroups.flatMap((group) => group.images);

  const [projectFrench, pictureFrench, drawingFrench, filmFrench] = await Promise.all([
    translationsFor(locale, 'Project', [rest.id]),
    translationsFor(locale, 'ProjectImage', pictures.map(nameOf)),
    translationsFor(locale, 'Drawing', rest.drawings.map(nameOf)),
    /* The film is filed under the project, because a project has one film and
       saving the project writes a new row for it every time. */
    translationsFor(locale, 'Film', film ? [rest.id] : []),
  ]);

  return {
    ...applyTranslation(rest, PROJECT_DETAIL_FIELDS, projectFrench.get(rest.id)),
    imageGroups: rest.imageGroups.map((group) => ({
      ...group,
      images: overlayBy(group.images, PROJECT_IMAGE_FIELDS, pictureFrench, nameOf),
    })),
    drawings: overlayBy(rest.drawings, DRAWING_FIELDS, drawingFrench, nameOf),
    film: toFilmView(film && applyTranslation(film, FILM_FIELDS, filmFrench.get(rest.id))),
  };
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
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ prev: ProjectSummary; next: ProjectSummary } | null> {
  const projects = await getPublishedProjects(locale);
  if (projects.length === 0) return null;

  /* By slug, which is the same in both languages, so the pager finds the
     project it is standing on however the page is written. */
  const index = projects.findIndex((project) => project.slug === slug);
  if (index === -1) return null;

  const count = projects.length;
  return {
    prev: projects[(index - 1 + count) % count],
    next: projects[(index + 1) % count],
  };
}

/** Everything the site knows about Ahmad himself, as the pages read it. */
async function fetchProfile() {
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

export type ProfileView = Awaited<ReturnType<typeof fetchProfile>>;

/**
 * The resume, the contact page and the name at the top of every page.
 *
 * Nine models in French, and nine lookups: one for each, never one per line of
 * a resume that runs to about a hundred of them. The skills are the only nested
 * list, and they are gathered across their groups so they stay one lookup too.
 */
export async function getProfile(locale: Locale = DEFAULT_LOCALE): Promise<ProfileView> {
  const bundle = await fetchProfile();
  if (locale === DEFAULT_LOCALE) return bundle;

  const { profile, facts, social, experience, education, skillGroups, languages, entries } = bundle;
  const skills = skillGroups.flatMap((group) => group.items);

  const [
    profileFrench,
    factFrench,
    socialFrench,
    experienceFrench,
    educationFrench,
    groupFrench,
    skillFrench,
    languageFrench,
    entryFrench,
  ] = await Promise.all([
    translationsFor(locale, 'Profile', profile ? [profile.id] : []),
    translationsFor(locale, 'Fact', idsOf(facts)),
    translationsFor(locale, 'SocialLink', idsOf(social)),
    translationsFor(locale, 'ExperienceEntry', idsOf(experience)),
    translationsFor(locale, 'EducationEntry', idsOf(education)),
    translationsFor(locale, 'SkillGroup', idsOf(skillGroups)),
    translationsFor(locale, 'Skill', idsOf(skills)),
    translationsFor(locale, 'Language', idsOf(languages)),
    translationsFor(locale, 'ResumeEntry', idsOf(entries)),
  ]);

  return {
    profile:
      profile && translateRow(profile, PROFILE_FIELDS, PROFILE_LISTS, profileFrench.get(profile.id)),
    facts: translateRows(facts, FACT_FIELDS, FACT_LISTS, factFrench),
    social: overlay(social, SOCIAL_FIELDS, socialFrench),
    experience: translateRows(experience, EXPERIENCE_FIELDS, EXPERIENCE_LISTS, experienceFrench),
    education: overlay(education, EDUCATION_FIELDS, educationFrench),
    skillGroups: skillGroups.map((group) => ({
      ...applyTranslation(group, SKILL_GROUP_FIELDS, groupFrench.get(group.id)),
      items: overlay(group.items, SKILL_FIELDS, skillFrench),
    })),
    languages: overlay(languages, LANGUAGE_FIELDS, languageFrench),
    entries: overlay(entries, RESUME_ENTRY_FIELDS, entryFrench),
  };
}

/** The site hero film is the one Film row with no project attached. */
/**
 * A film that belongs to a fixed place on the site rather than to a project.
 *
 * "hero" plays behind the name at the top of the home page, "closing" behind
 * About and Get in touch at the bottom of it. They used to be identified by
 * having no project, which was enough while there was only one of them.
 */
export async function getSiteFilm(
  slot: 'hero' | 'closing',
  locale: Locale = DEFAULT_LOCALE,
): Promise<FilmView | null> {
  const row = await db.film.findFirst({
    where: { slot },
    select: filmInclude,
  });
  if (!row || locale === DEFAULT_LOCALE) return toFilmView(row);

  /* Under the slot, not the row: saving the home page deletes this film and
     writes a new one, and the slot is the part that stays. */
  const french = await translationsFor(locale, 'Film', [slot]);
  return toFilmView(applyTranslation(row, FILM_FIELDS, french.get(slot)));
}

export async function getHeroFilm(locale: Locale = DEFAULT_LOCALE): Promise<FilmView | null> {
  return getSiteFilm('hero', locale);
}

export async function getClosingFilm(locale: Locale = DEFAULT_LOCALE): Promise<FilmView | null> {
  return getSiteFilm('closing', locale);
}
