import { describe, expect, it } from 'vitest';

import { resolveCover } from './cover-image';

const group = (...images: { mediaId: string; alt: string }[]) => ({ images });

/**
 * A project whose card is blank on every listing while its own page shows all
 * its pictures. It happened on the first project made after the save was
 * repaired: renders added, saved, project page correct, card empty, because the
 * cover is a separate box that had not been filled in.
 */
describe('choosing a project cover', () => {
  it('uses the first picture when no cover was chosen', () => {
    const cover = resolveCover(null, '', [
      group({ mediaId: 'm1', alt: 'The courtyard at noon' }, { mediaId: 'm2', alt: 'Second' }),
      group({ mediaId: 'm3', alt: 'Third' }),
    ]);

    expect(cover).toEqual({ leadImageId: 'm1', leadImageAlt: 'The courtyard at noon' });
  });

  it('keeps the cover Ahmad chose, and does not overwrite it with the first picture', () => {
    const cover = resolveCover('chosen', 'What the cover shows', [
      group({ mediaId: 'm1', alt: 'The courtyard at noon' }),
    ]);

    expect(cover).toEqual({ leadImageId: 'chosen', leadImageAlt: 'What the cover shows' });
  });

  it('leaves a project with no pictures without a cover, since there is nothing to use', () => {
    expect(resolveCover(null, '', [])).toEqual({ leadImageId: null, leadImageAlt: '' });
    expect(resolveCover(undefined, undefined, [group()])).toEqual({
      leadImageId: null,
      leadImageAlt: '',
    });
  });

  it('skips over an empty group to the first group that actually has a picture', () => {
    const cover = resolveCover(null, '', [group(), group({ mediaId: 'm9', alt: 'From the street' })]);

    expect(cover).toEqual({ leadImageId: 'm9', leadImageAlt: 'From the street' });
  });

  it('trims, so a description of only spaces does not become the cover text', () => {
    expect(resolveCover(null, '', [group({ mediaId: 'm1', alt: '   ' })])).toEqual({
      leadImageId: 'm1',
      leadImageAlt: '',
    });
    expect(resolveCover('chosen', '  padded  ', [])).toEqual({
      leadImageId: 'chosen',
      leadImageAlt: 'padded',
    });
  });
})
