/**
 * The cover, and what is printed under it.
 *
 * A project page prints its cover once, across the middle of the page, and
 * then runs every other picture in the gallery below. The cover is left out of
 * that run so the same photograph does not appear twice, and that is where its
 * caption went missing: the caption belongs to the picture, the picture was
 * dropped from the gallery, and the cover plate printed nothing under itself.
 * Ahmad typed the words, the save kept them, and the page showed them nowhere.
 *
 * So the two halves live here together. The gallery leaves the cover out, and
 * the cover plate takes the caption of the picture it left out. Both are plain
 * functions of the project as the query hands it over, which means they see the
 * French caption on the French page without knowing there is such a thing.
 */

export interface CoverRef {
  id: string;
}

export interface CaptionedPicture {
  caption: string | null;
  media: { id: string };
}

/**
 * The words under the cover: the caption of the first picture showing the same
 * file. Nothing when there is no cover, when the cover sits in no group, or
 * when the picture has no caption written.
 */
export function coverCaption(
  cover: CoverRef | null | undefined,
  groups: { images: CaptionedPicture[] }[],
): string | null {
  if (!cover) return null;
  for (const group of groups) {
    for (const image of group.images) {
      if (image.media.id !== cover.id) continue;
      const caption = image.caption?.trim();
      return caption ? caption : null;
    }
  }
  return null;
}

/** Every picture from every group, in order, minus the cover. */
export function galleryWithoutCover<T extends CaptionedPicture>(
  cover: CoverRef | null | undefined,
  groups: { images: T[] }[],
): T[] {
  return groups.flatMap((group) => group.images).filter((image) => image.media.id !== cover?.id);
}
