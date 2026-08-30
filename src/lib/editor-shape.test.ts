import { describe, expect, it } from 'vitest';

import { toEditorDrawings, toEditorGroups } from './editor-shape';

const media = (id: string) => ({ id, key: `projects/x/${id}.jpg`, bytes: 1000, width: 1600, height: 900 });

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
    const [group] = toEditorGroups([
      {
        id: 'g1',
        layout: 'pair',
        caption: 'the old group caption',
        images: [
          { id: 'i1', mediaId: 'm1', alt: 'The courtyard', caption: 'Phase two, from the street', media: media('m1') },
          { id: 'i2', mediaId: 'm2', alt: 'The lookout', caption: null, media: media('m2') },
        ],
      },
    ]);

    expect(group.images[0].caption).toBe('Phase two, from the street');
    /* Empty, not undefined: the box is a controlled input and undefined would
       make React hand it back as uncontrolled. */
    expect(group.images[1].caption).toBe('');
  });

  it('keeps every picture its own description and caption, in order', () => {
    const [group] = toEditorGroups([
      {
        id: 'g1',
        layout: 'full',
        caption: null,
        images: [
          { id: 'i1', mediaId: 'm1', alt: 'First', caption: 'One', media: media('m1') },
          { id: 'i2', mediaId: 'm2', alt: 'Second', caption: 'Two', media: media('m2') },
        ],
      },
    ]);

    expect(group.images.map((image) => [image.alt, image.caption])).toEqual([
      ['First', 'One'],
      ['Second', 'Two'],
    ]);
  });

  it('fills every field the screen edits, so a new one cannot be half added', () => {
    /* The guard against the next version of this bug. A field the screen can
       send back must be a field this mapping fills, or saving writes over
       whatever was there. */
    const [group] = toEditorGroups([
      {
        id: 'g1',
        layout: 'pair',
        caption: 'c',
        images: [{ id: 'i1', mediaId: 'm1', alt: 'a', caption: 'cap', media: media('m1') }],
      },
    ]);

    expect(Object.keys(group.images[0]).sort()).toEqual(['alt', 'caption', 'id', 'media', 'mediaId']);
    for (const [key, value] of Object.entries(group.images[0])) {
      expect(value, `${key} arrived empty from the database`).toBeDefined();
    }
  });

  it('carries a drawing across with its kind and description', () => {
    const [drawing] = toEditorDrawings([
      { id: 'd1', mediaId: 'm3', alt: 'Section through the court', drawingType: 'Section', media: media('m3') },
    ]);

    expect(drawing).toMatchObject({ alt: 'Section through the court', drawingType: 'Section', mediaId: 'm3' });
  });
})
