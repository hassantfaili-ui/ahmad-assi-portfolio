import { describe, expect, it } from 'vitest';

import { coverCaption, galleryWithoutCover } from './cover-plate';

const media = (id: string) => ({ id, key: `projects/x/${id}.jpg`, width: 1600, height: 900 });

const picture = (id: string, mediaId: string, caption: string | null) => ({
  id,
  alt: `alt for ${id}`,
  caption,
  media: media(mediaId),
});

/**
 * The cover's caption has to come out somewhere.
 *
 * It did not. The gallery leaves the cover out so the same photograph is not
 * printed twice, and the cover plate printed the picture with no caption under
 * it, so the words Ahmad typed under that picture were saved and then shown
 * nowhere on the page. Nothing failed and nothing said so, which is exactly
 * what "the caption for the cover photo is not working" looks like from the
 * editing screen.
 */
describe('the caption under the cover', () => {
  it('is the caption of the picture that is the cover', () => {
    const groups = [
      { images: [picture('p1', 'm1', 'The street front'), picture('p2', 'm2', 'From the garden')] },
    ];
    expect(coverCaption(media('m2'), groups)).toBe('From the garden');
  });

  it('is nothing when the cover sits in no group', () => {
    const groups = [{ images: [picture('p1', 'm1', 'The street front')] }];
    expect(coverCaption(media('m9'), groups)).toBeNull();
  });

  it('is nothing when there is no cover', () => {
    const groups = [{ images: [picture('p1', 'm1', 'The street front')] }];
    expect(coverCaption(null, groups)).toBeNull();
  });

  it('is nothing when the picture has no caption, or only spaces', () => {
    expect(coverCaption(media('m1'), [{ images: [picture('p1', 'm1', null)] }])).toBeNull();
    expect(coverCaption(media('m1'), [{ images: [picture('p1', 'm1', '   ')] }])).toBeNull();
  });

  it('takes the first picture showing the cover when the file appears more than once', () => {
    const groups = [
      { images: [picture('p1', 'm1', 'Said first')] },
      { images: [picture('p2', 'm1', 'Said again')] },
    ];
    expect(coverCaption(media('m1'), groups)).toBe('Said first');
  });
});

describe('the gallery under the cover', () => {
  it('runs every picture from every group in order, without the cover', () => {
    const groups = [
      { images: [picture('p1', 'm1', null), picture('p2', 'm2', null)] },
      { images: [picture('p3', 'm3', null)] },
    ];
    expect(galleryWithoutCover(media('m2'), groups).map((image) => image.id)).toEqual(['p1', 'p3']);
  });

  it('keeps every picture when there is no cover', () => {
    const groups = [{ images: [picture('p1', 'm1', null), picture('p2', 'm2', null)] }];
    expect(galleryWithoutCover(null, groups).map((image) => image.id)).toEqual(['p1', 'p2']);
  });

  it('leaves out every appearance of the cover, not only the first', () => {
    const groups = [
      { images: [picture('p1', 'm1', null)] },
      { images: [picture('p2', 'm2', null), picture('p3', 'm1', null)] },
    ];
    expect(galleryWithoutCover(media('m1'), groups).map((image) => image.id)).toEqual(['p2']);
  });
});
