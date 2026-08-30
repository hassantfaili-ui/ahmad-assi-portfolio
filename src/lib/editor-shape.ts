import type { EditorDrawing, EditorGroup } from '@/components/admin/MediaPanel';

/**
 * Turning what the database holds into what the editing screen edits.
 *
 * This lived inline in the project screen, and that is how a caption on every
 * picture shipped half finished. The screen sent captions back and the save
 * wrote them, but this mapping never read them, so every picture arrived with
 * an empty caption and the first save wrote that emptiness over the lot. Ahmad
 * lost fifteen captions in one press, and because the same gap meant a saved
 * caption was never read back, the screen looked like it had saved nothing at
 * all.
 *
 * A field is only really added when both directions know about it. Out here it
 * can be tested against the payload the screen produces, which is the test that
 * would have caught it.
 */

type MediaRow = {
  id: string;
  key: string;
  bytes: number;
  width: number | null;
  height: number | null;
};

type ImageRow = {
  id: string;
  mediaId: string;
  alt: string;
  caption: string | null;
  media: MediaRow;
};

type GroupRow = {
  id: string;
  layout: 'pair' | 'full' | 'triptych';
  caption: string | null;
  images: ImageRow[];
};

type DrawingRow = {
  id: string;
  mediaId: string;
  alt: string;
  drawingType: string;
  media: MediaRow;
};

function toMedia(media: MediaRow) {
  return {
    id: media.id,
    key: media.key,
    bytes: media.bytes,
    width: media.width,
    height: media.height,
  };
}

export function toEditorGroups(groups: GroupRow[]): EditorGroup[] {
  return groups.map((group) => ({
    id: group.id,
    layout: group.layout,
    /* Carried, never shown. A caption belongs to a picture now; this is only
       here so an older group's text is not dropped from the row it came in on. */
    caption: group.caption ?? '',
    images: group.images.map((image) => ({
      id: image.id,
      mediaId: image.mediaId,
      alt: image.alt,
      caption: image.caption ?? '',
      media: toMedia(image.media),
    })),
  }));
}

export function toEditorDrawings(drawings: DrawingRow[]): EditorDrawing[] {
  return drawings.map((drawing) => ({
    id: drawing.id,
    mediaId: drawing.mediaId,
    alt: drawing.alt,
    drawingType: drawing.drawingType,
    media: toMedia(drawing.media),
  }));
}
