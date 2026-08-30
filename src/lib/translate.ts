/**
 * Laying French over English records.
 *
 * Pure, and deliberately separate from the reading and writing in
 * translations.ts: that module is server only because it touches the database,
 * and this is the part worth testing, since the fallback below is what lets the
 * site be bilingual before a single sentence is translated.
 */

/** field name to French text, for one row. */
export type RowTranslations = Record<string, string>;

/** row id to its translated fields, for one model. */
export type ModelTranslations = Map<string, RowTranslations>;

/**
 * One row with its French fields laid over it.
 *
 * Only the fields asked for are considered, so a translation left behind by a
 * field that has since been renamed cannot reappear as a value the page did not
 * expect. A blank translation is not a translation: a box someone opened and
 * left empty must read as "not translated yet" and show the English, rather
 * than publishing an empty heading.
 */
export function applyTranslation<T extends Record<string, unknown>>(
  row: T,
  fields: readonly (keyof T & string)[],
  translations: RowTranslations | undefined,
): T {
  if (!translations) return row;

  let changed = false;
  const next: Record<string, unknown> = { ...row };
  for (const field of fields) {
    const value = translations[field];
    if (typeof value === 'string' && value.trim()) {
      next[field] = value;
      changed = true;
    }
  }

  return changed ? (next as T) : row;
}

/** The same, for a list of rows that each carry their own id. */
export function overlay<T extends { id: string } & Record<string, unknown>>(
  rows: T[],
  fields: readonly (keyof T & string)[],
  translations: ModelTranslations,
): T[] {
  if (translations.size === 0) return rows;
  return rows.map((row) => applyTranslation(row, fields, translations.get(row.id)));
}

/**
 * A name for a picture that survives being saved.
 *
 * Saving a project deletes every picture row and writes them again, so a
 * picture's database id is new after every press. A translation keyed to that
 * id would be orphaned the first time Ahmad touched anything, and the French he
 * had written would quietly stop appearing.
 *
 * So a picture is named by the project it is in and the file it shows, which is
 * what actually identifies it and what does not change. The project is part of
 * it because the same photograph can be used by two projects and deserve a
 * different sentence in each.
 */
export function pictureKey(projectId: string, mediaId: string): string {
  return `${projectId}:${mediaId}`;
}
