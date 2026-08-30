import type { EditorDrawing, EditorGroup } from '@/components/admin/MediaPanel';
import type { ModelTranslations, RowTranslations } from '@/lib/translate';

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
 *
 * The French boxes are the same lesson one language further along, which is why
 * the lists below live here rather than being written out again in each panel.
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

/**
 * Which fields get a French box, one list per kind of row.
 *
 * This is the only list. The screen builds its boxes from it, the mapping below
 * fills those boxes from the Translation table by it, and the payload carries
 * exactly these names back out, so a field cannot be translatable on the way in
 * and forgotten on the way out.
 *
 * The web address, the sheet number, the year, the category and the status are
 * deliberately absent. The first three are the same in both languages, and the
 * last two are fixed values the site translates for itself in dictionary.ts,
 * so a box here would be asking Ahmad to do work the site has already done.
 */
export const PROJECT_FRENCH_FIELDS = [
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
] as const;

export const IMAGE_FRENCH_FIELDS = ['alt', 'caption'] as const;

export const DRAWING_FRENCH_FIELDS = ['alt', 'drawingType'] as const;

export const FILM_FRENCH_FIELDS = ['caption'] as const;

/**
 * The French for one row, field by field, as the screen holds it.
 *
 * Written as Record rather than as an interface on purpose: a type alias picks
 * up an index signature, so one of these can be handed straight to
 * saveTranslations without being copied field by field into a plain object.
 */
export type ProjectFrench = Record<(typeof PROJECT_FRENCH_FIELDS)[number], string>;
export type ImageFrench = Record<(typeof IMAGE_FRENCH_FIELDS)[number], string>;
export type DrawingFrench = Record<(typeof DRAWING_FRENCH_FIELDS)[number], string>;
export type FilmFrench = Record<(typeof FILM_FRENCH_FIELDS)[number], string>;

/**
 * The French held for one row, as boxes for the screen.
 *
 * Every field named gets a string, blank where nothing is stored. Blank because
 * these are controlled inputs and undefined makes React hand the box back as an
 * uncontrolled one, and because blank is the honest reading anyway: nothing
 * translated yet, so the English shows on the site.
 */
export function toEditorFrench<K extends string>(
  fields: readonly K[],
  stored: RowTranslations | undefined,
): Record<K, string> {
  const french = {} as Record<K, string>;
  for (const field of fields) french[field] = stored?.[field] ?? '';
  return french;
}

function toMedia(media: MediaRow) {
  return {
    id: media.id,
    key: media.key,
    bytes: media.bytes,
    width: media.width,
    height: media.height,
  };
}

/**
 * The arrangement, with the French already on it.
 *
 * The French is asked for rather than optional. An editing screen that filled
 * its English boxes and quietly left its French ones blank would send that
 * blankness back on the first save, which is exactly how fifteen captions were
 * lost, so there is no call shape here that can forget it.
 */
export function toEditorGroups(groups: GroupRow[], french: ModelTranslations): EditorGroup[] {
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
      french: toEditorFrench(IMAGE_FRENCH_FIELDS, french.get(image.id)),
      media: toMedia(image.media),
    })),
  }));
}

export function toEditorDrawings(
  drawings: DrawingRow[],
  french: ModelTranslations,
): EditorDrawing[] {
  return drawings.map((drawing) => ({
    id: drawing.id,
    mediaId: drawing.mediaId,
    alt: drawing.alt,
    drawingType: drawing.drawingType,
    french: toEditorFrench(DRAWING_FRENCH_FIELDS, french.get(drawing.id)),
    media: toMedia(drawing.media),
  }));
}
