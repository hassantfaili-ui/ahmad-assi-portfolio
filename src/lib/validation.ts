/**
 * The content rules, enforced when Ahmad saves.
 *
 * Every one of these was a Zod rule in the Astro content schema that failed the
 * build. That was a good rule in a bad place: the person who broke it was not
 * the person reading the build log, and a failed deploy is a poor way to learn
 * that an alt attribute is missing. Each now returns a message against the
 * field it belongs to.
 *
 * Pure on purpose. Imported by both the server actions and the forms, so no
 * node builtins, no process.env, no server-only.
 */

export type FieldErrors = Record<string, string>;

export const CATEGORIES = [
  'Residential',
  'Cultural',
  'Commercial',
  'Academic',
  'Competition',
] as const;

export const STATUSES = [
  'Built',
  'UnderConstruction',
  'DesignDevelopment',
  'Unbuilt',
  'Competition',
  'Academic',
] as const;

export const TIERS = ['lead', 'set', 'index'] as const;
export const LAYOUTS = ['pair', 'full', 'triptych'] as const;

/** How each status reads on the page. The enum cannot hold a space. */
export const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  Built: 'Built',
  UnderConstruction: 'Under construction',
  DesignDevelopment: 'Design development',
  Unbuilt: 'Unbuilt',
  Competition: 'Competition',
  Academic: 'Academic',
};

/** Sheet numbers look like A-101. */
export const SHEET_PATTERN = /^A-\d{3}$/;

export interface ProjectInput {
  title: string;
  slug: string;
  sheet: string;
  category: string;
  year: number;
  location: string;
  buildingType: string;
  area?: string | null;
  status: string;
  role: string;
  contribution: string;
  summary: string;
  body?: string;
  credit: string;
  tier: string;
  order: number;
  leadImageId?: string | null;
  leadImageAlt?: string;
}

function required(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateProject(input: ProjectInput): FieldErrors {
  const errors: FieldErrors = {};

  if (!required(input.title)) errors.title = 'A project needs a title.';
  if (!required(input.slug)) errors.slug = 'A project needs a web address.';

  if (!required(input.sheet)) {
    errors.sheet = 'A sheet number is required.';
  } else if (!SHEET_PATTERN.test(input.sheet.trim())) {
    errors.sheet = 'Sheet numbers look like A-101.';
  }

  if (!CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])) {
    errors.category = 'Choose a category.';
  }
  if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) {
    errors.status = 'Choose a status.';
  }
  if (!TIERS.includes(input.tier as (typeof TIERS)[number])) {
    errors.tier = 'Choose where this sits on the home page.';
  }

  if (!Number.isInteger(input.year)) {
    errors.year = 'The year has to be a whole number.';
  } else if (input.year < 1900 || input.year > 2100) {
    errors.year = 'That year looks wrong. Use a four digit year.';
  }

  if (!required(input.location)) errors.location = 'Where is it?';
  if (!required(input.buildingType)) errors.buildingType = 'What kind of building is it?';
  if (!required(input.role)) errors.role = 'What was your role?';
  if (!required(input.summary)) errors.summary = 'One or two sentences describing the project.';

  // Kept separate from the summary on purpose. On team projects this is the
  // difference between an honest portfolio and a misleading one.
  if (!required(input.contribution)) {
    errors.contribution = 'Describe what you did on this project.';
  }

  if (!required(input.credit)) {
    errors.credit =
      'Say who did the work. A portfolio that does not distinguish solo work from group work is misleading, and a reviewer assumes the worst when it is left out.';
  }

  if (input.leadImageId && !required(input.leadImageAlt)) {
    errors.leadImageAlt = 'Alt text is required. It is what a screen reader announces.';
  }

  return errors;
}

export interface ImageInput {
  mediaId: string;
  alt: string;
}

export function validateImages(images: ImageInput[]): FieldErrors {
  const errors: FieldErrors = {};
  images.forEach((image, i) => {
    if (!required(image.alt)) {
      errors[`images.${i}.alt`] = 'Alt text is required. It is what a screen reader announces.';
    }
  });
  return errors;
}

export interface FilmInput {
  sourceMediaIds: string[];
  youtubeId?: string | null;
  posterMediaId?: string | null;
}

export function validateFilm(input: FilmInput): FieldErrors {
  const errors: FieldErrors = {};
  if (input.sourceMediaIds.length === 0 && !required(input.youtubeId)) {
    errors.film = 'A film needs either an uploaded file or a YouTube id.';
  }
  if (!input.posterMediaId && input.sourceMediaIds.length > 0) {
    errors.filmPoster =
      'A film needs a poster frame. One is taken automatically when you upload the video.';
  }
  return errors;
}

/**
 * Only three projects can lead.
 *
 * A fourth does not break anything and is not lost: it falls through into the
 * strip in its usual place by order. That behaviour lives in src/lib/tiers.ts
 * and exists because losing a project off the front page with no warning was a
 * real bug. This is the other half of the fix. The rule is contained in code,
 * and now it is also said out loud, so Ahmad is not left wondering why the
 * project he just promoted did not move.
 */
export function leadOverflowWarning(leadCount: number): string | null {
  if (leadCount <= 3) return null;
  const extra = leadCount - 3;
  return `Only three projects can lead. ${extra} more ${
    extra === 1 ? 'is' : 'are'
  } marked as a lead and will appear in the strip instead. Move one of the top three down to swap.`;
}

export interface ProfileInput {
  name: string;
  discipline: string;
  email: string;
  phone: string;
  location: string;
}

export function validateProfile(input: ProfileInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!required(input.name)) errors.name = 'A name is required.';
  if (!required(input.discipline)) errors.discipline = 'A discipline is required.';
  if (!required(input.location)) errors.location = 'A location is required.';

  if (!required(input.email)) {
    errors.email = 'An email address is required. It is the only route on the contact page.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'That does not look like an email address.';
  }

  if (!required(input.phone)) errors.phone = 'A telephone number is required.';

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
