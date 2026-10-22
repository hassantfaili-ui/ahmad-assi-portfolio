import { describe, expect, it } from 'vitest';

import type { ModelTranslations } from './translate';
import {
  IMAGE_FRENCH_FIELDS,
  PROJECT_FRENCH_FIELDS,
  toEditorDrawings,
  toEditorFrench,
  toEditorGroups,
} from './editor-shape';

const media = (id: string) => ({ id, key: `projects/x/${id}.jpg`, bytes: 1000, width: 1600, height: 900 });

/** No French stored at all, which is where every project starts. */
const untranslated: ModelTranslations = new Map();

/** The French held against some rows, the way translationsFor hands it over. */
function stored(rows: Record<string, Record<string, string>>): ModelTranslations {
  return new Map(Object.entries(rows));
}

/**
 * The screen and the database have to agree in BOTH directions.
 *
 * They did not. The editing screen sent a caption per picture and the save
 * wrote it, but the mapping that fills the screen never read one, so every
 * picture arrived blank and the first save wrote that blankness over fifteen
 * real captions. Nothing failed and nothing said so: the screen reported a
 * save, and because the same gap meant a stored caption was never read back,
 * a refresh looked like the save had done nothing.
 */
describe('filling the editing screen from the database', () => {
  it('carries the caption stored against each picture', () => {
    const [group] = toEditorGroups(
      [
        {
          id: 'g1',
          layout: 'pair',
          caption: 'the old group caption',
          images: [
            { id: 'i1', mediaId: 'm1', alt: 'The courtyard', caption: 'Phase two, from the street', ratio: null, focusX: 0.5, focusY: 0.5, media: media('m1') },
            { id: 'i2', mediaId: 'm2', alt: 'The lookout', caption: null, ratio: null, focusX: 0.5, focusY: 0.5, media: media('m2') },
          ],
        },
      ],
      untranslated,
    );

    expect(group.images[0].caption).toBe('Phase two, from the street');
    /* Empty, not undefined: the box is a controlled input and undefined would
       make React hand it back as uncontrolled. */
    expect(group.images[1].caption).toBe('');
  });

  it('keeps every picture its own description and caption, in order', () => {
    const [group] = toEditorGroups(
      [
        {
          id: 'g1',
          layout: 'full',
          caption: null,
          images: [
            { id: 'i1', mediaId: 'm1', alt: 'First', caption: 'One', ratio: null, focusX: 0.5, focusY: 0.5, media: media('m1') },
            { id: 'i2', mediaId: 'm2', alt: 'Second', caption: 'Two', ratio: null, focusX: 0.5, focusY: 0.5, media: media('m2') },
          ],
        },
      ],
      untranslated,
    );

    expect(group.images.map((image) => [image.alt, image.caption])).toEqual([
      ['First', 'One'],
      ['Second', 'Two'],
    ]);
  });

  it('fills every field the screen edits, so a new one cannot be half added', () => {
    /* The guard against the next version of this bug. A field the screen can
       send back must be a field this mapping fills, or saving writes over
       whatever was there. */
    const [group] = toEditorGroups(
      [
        {
          id: 'g1',
          layout: 'pair',
          caption: 'c',
          images: [{ id: 'i1', mediaId: 'm1', alt: 'a', caption: 'cap', ratio: null, focusX: 0.5, focusY: 0.5, media: media('m1') }],
        },
      ],
      untranslated,
    );

    expect(Object.keys(group.images[0]).sort()).toEqual([
      'alt',
      'caption',
      'focus',
      'french',
      'id',
      'media',
      'mediaId',
      'ratio',
    ]);
    for (const [key, value] of Object.entries(group.images[0])) {
      expect(value, `${key} arrived empty from the database`).toBeDefined();
    }
  });

  it('carries a drawing across with its kind and description', () => {
    const [drawing] = toEditorDrawings(
      [
        { id: 'd1', mediaId: 'm3', alt: 'Section through the court', drawingType: 'Section', media: media('m3') },
      ],
      untranslated,
    );

    expect(drawing).toMatchObject({ alt: 'Section through the court', drawingType: 'Section', mediaId: 'm3' });
  });
});

/**
 * The same lesson, one language further along.
 *
 * The French boxes send their contents back on every save, so this mapping has
 * to read the French out of the Translation table on the way in. If it did not,
 * every box would arrive blank, the first save would send that blankness, and
 * saveTranslations would delete the lot: seventeen projects of translation gone
 * in one press, with nothing failing and nothing warning.
 */
describe('filling the French boxes from the Translation table', () => {
  const oneGroup = [
    {
      id: 'g1',
      layout: 'pair' as const,
      caption: null,
      images: [
        { id: 'i1', mediaId: 'm1', alt: 'The courtyard', caption: 'At dusk', ratio: null, focusX: 0.5, focusY: 0.5, media: media('m1') },
        { id: 'i2', mediaId: 'm2', alt: 'The stair', caption: null, ratio: null, focusX: 0.5, focusY: 0.5, media: media('m2') },
      ],
    },
  ];

  it('puts each picture the French stored against that picture', () => {
    const [group] = toEditorGroups(
      oneGroup,
      stored({
        i1: { alt: 'La cour', caption: 'Au crepuscule' },
        i2: { alt: "L'escalier" },
      }),
    );

    expect(group.images[0].french).toEqual({ alt: 'La cour', caption: 'Au crepuscule' });
    /* A picture with only half of it translated is the ordinary case, and the
       untranslated half is blank rather than absent, for the same reason the
       caption is: a controlled box needs a string. */
    expect(group.images[1].french).toEqual({ alt: "L'escalier", caption: '' });
  });

  it('gives every French box a string when nothing is translated at all', () => {
    const [group] = toEditorGroups(oneGroup, untranslated);

    expect(group.images[0].french).toEqual({ alt: '', caption: '' });
    for (const [key, value] of Object.entries(group.images[0].french)) {
      expect(typeof value, `${key} would make its box uncontrolled`).toBe('string');
    }
  });

  it('puts each drawing the French stored against that drawing', () => {
    const [drawing] = toEditorDrawings(
      [{ id: 'd1', mediaId: 'm3', alt: 'Section', drawingType: 'Section', media: media('m3') }],
      stored({ d1: { alt: 'Coupe transversale', drawingType: 'Coupe' } }),
    );

    expect(drawing.french).toEqual({ alt: 'Coupe transversale', drawingType: 'Coupe' });
  });

  it('ignores French left behind by a field that no longer has a box', () => {
    /* A field can be renamed or dropped, and its rows sit in the table until
       something clears them. Reading only the fields asked for means an old one
       cannot reappear in a box that was never meant to hold it. */
    const french = toEditorFrench(IMAGE_FRENCH_FIELDS, {
      alt: 'La cour',
      caption: 'Au crepuscule',
      subtitle: 'a field this screen has never had',
    });

    expect(Object.keys(french).sort()).toEqual(['alt', 'caption']);
  });

  it('names the project fields that get a box, and only those', () => {
    /* The web address, the sheet, the year, the category and the status are
       deliberately absent: the first three read the same in both languages, and
       the last two are the site's own vocabulary, translated in dictionary.ts
       rather than by Ahmad. */
    expect([...PROJECT_FRENCH_FIELDS]).toEqual([
      'title',
      'location',
      'buildingType',
      'area',
      'role',
      'contribution',
      'summary',
      'body',
      'credit',
      'leadImageAlt',
    ]);
  });
});

/**
 * The shape a picture is cut to goes the same way: read here, sent back by the
 * screen, written by the save. A shape the column holds that crop.ts does not
 * know lands as "its own shape", never as a pressed button that is not there.
 */
describe('the shape and the focus of a picture', () => {
  it('carries the stored shape and where the window sits', () => {
    const [group] = toEditorGroups(
      [
        {
          id: 'g1',
          layout: 'pair',
          caption: null,
          images: [
            { id: 'i1', mediaId: 'm1', alt: 'The courtyard', caption: null, ratio: '16:9', focusX: 0.2, focusY: 1, media: media('m1') },
          ],
        },
      ],
      untranslated,
    );
    expect(group.images[0].ratio).toBe('16:9');
    expect(group.images[0].focus).toEqual({ x: 0.2, y: 1 });
  });

  it('reads an unknown shape as none and a stray focus as the edge', () => {
    const [group] = toEditorGroups(
      [
        {
          id: 'g1',
          layout: 'pair',
          caption: null,
          images: [
            { id: 'i1', mediaId: 'm1', alt: 'The courtyard', caption: null, ratio: '5:4', focusX: 3, focusY: -1, media: media('m1') },
            { id: 'i2', mediaId: 'm2', alt: 'The lookout', caption: null, ratio: null, focusX: 0.5, focusY: 0.5, media: media('m2') },
          ],
        },
      ],
      untranslated,
    );
    expect(group.images[0].ratio).toBeNull();
    expect(group.images[0].focus).toEqual({ x: 1, y: 0 });
    expect(group.images[1].ratio).toBeNull();
  });
});
