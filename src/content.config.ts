import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * One collection Ahmad edits often (projects) and nothing else.
 * Resume data lives in src/data/resume.json as a single document, because it is
 * one person's record rather than a set of independent items.
 *
 * Shapes here are deliberately CMS-shaped: every field maps to one editor input,
 * and alt text is required so an image cannot ship without it.
 */

const image = z.object({
  src: z.string(),
  alt: z.string().min(1, 'Alt text is required on every image'),
  kind: z.enum(['plan', 'section', 'elevation', 'axonometric', 'site', 'photo']).default('photo'),
  seed: z.number().int().optional(),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    sheet: z.string().regex(/^A-\d{3}$/, 'Sheet numbers look like A-101'),
    category: z.enum(['Residential', 'Cultural', 'Commercial', 'Academic', 'Competition']),
    year: z.number().int(),
    location: z.string(),
    buildingType: z.string(),
    area: z.string().optional(),
    status: z.enum([
      'Built',
      'Under construction',
      'Design development',
      'Unbuilt',
      'Competition',
      'Academic',
    ]),
    // Kept separate from the description on purpose: on team projects this is the
    // difference between an honest portfolio and a misleading one.
    role: z.string(),
    contribution: z.string(),
    summary: z.string(),
    leadImage: image,
    imageGroups: z
      .array(
        z.object({
          layout: z.enum(['pair', 'full', 'triptych']),
          caption: z.string().optional(),
          images: z.array(image).min(1),
        }),
      )
      .default([]),
    drawings: z
      .array(image.extend({ drawingType: z.string() }))
      .default([]),
    /** An optional walkthrough or flythrough for this project. */
    /* Either a file in this repo or a YouTube id. A 4K walkthrough is far too
       large to commit, so YouTube carries those and the repo stays light. */
    film: z
      .object({
        src: z.string().optional(),
        youtube: z.string().optional(),
        poster: z.string(),
        caption: z.string().optional(),
      })
      .refine((f) => Boolean(f.src || f.youtube), {
        message: 'A film needs either a file (src) or a YouTube id',
      })
      .optional(),
    featured: z.boolean().default(false),
    order: z.number().int().default(99),
  }),
});

export const collections = { projects };
