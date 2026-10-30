import 'server-only';

import { db } from '@/lib/db';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n';
import type { ModelTranslations } from '@/lib/translate';

export { applyTranslation, overlay } from '@/lib/translate';
export type { ModelTranslations, RowTranslations } from '@/lib/translate';

/**
 * Laying French over the English records.
 *
 * A translation is stored per field of per row, so nothing here knows or cares
 * which fields exist: a field becomes translatable the moment somebody asks for
 * it by name. English is never stored, because English is the record.
 *
 * Everything reads through `overlay`, which takes rows already fetched and
 * returns them with French where French exists. That shape matters: it means a
 * page fetches exactly as it always did and then puts the language on top,
 * rather than every query growing a locale argument and a join.
 */

export type TranslatableModel =
  | 'Project'
  | 'ProjectImage'
  | 'Drawing'
  | 'Film'
  | 'Profile'
  | 'Fact'
  | 'SocialLink'
  | 'ExperienceEntry'
  | 'EducationEntry'
  | 'SkillGroup'
  | 'Skill'
  | 'Language'
  | 'ResumeEntry';

/**
 * Every French field held for a set of rows, in one query.
 *
 * One query for a whole page rather than one per row: a project page shows a
 * project, its pictures, its drawings and its film, which row by row would be
 * forty round trips over Hyperdrive for a page that is otherwise two.
 */
export async function translationsFor(
  locale: Locale,
  model: TranslatableModel,
  recordIds: string[],
): Promise<ModelTranslations> {
  const byRecord: ModelTranslations = new Map();
  if (locale === DEFAULT_LOCALE || recordIds.length === 0) return byRecord;

  const rows = await db.translation.findMany({
    where: { locale, model, recordId: { in: recordIds } },
    select: { recordId: true, field: true, value: true },
  });

  for (const row of rows) {
    const fields = byRecord.get(row.recordId) ?? {};
    /* Blank is not a translation. A box someone opened and left empty must read
       as "not translated yet" and show the English, not as an empty heading. */
    if (row.value.trim()) fields[row.field] = row.value;
    byRecord.set(row.recordId, fields);
  }

  return byRecord;
}

/**
 * Write one row's French, replacing what was there.
 *
 * A field cleared to nothing has its row deleted rather than stored empty, so
 * "not translated" is one state in the database and not two.
 */
export async function saveTranslations(
  locale: Locale,
  model: TranslatableModel,
  recordId: string,
  values: Record<string, string | null | undefined>,
): Promise<void> {
  if (locale === DEFAULT_LOCALE) return;

  const entries = Object.entries(values);
  const filled = entries.filter(([, value]) => (value ?? '').trim());
  const cleared = entries.filter(([, value]) => !(value ?? '').trim()).map(([field]) => field);

  await db.$transaction([
    ...(cleared.length
      ? [db.translation.deleteMany({ where: { locale, model, recordId, field: { in: cleared } } })]
      : []),
    ...filled.map(([field, value]) =>
      db.translation.upsert({
        where: { locale_model_recordId_field: { locale, model, recordId, field } },
        create: { locale, model, recordId, field, value: (value ?? '').trim() },
        update: { value: (value ?? '').trim() },
      }),
    ),
  ]);
}

/**
 * Forget everything held for rows that no longer exist.
 *
 * The link to a row is a plain string, so nothing in the database removes these
 * when a project is deleted and its pictures go with it. Called from the writes
 * that delete rows, which is the only place that knows the ids are gone.
 */
export async function forgetTranslations(
  model: TranslatableModel,
  recordIds: string[],
): Promise<void> {
  if (recordIds.length === 0) return;
  await db.translation.deleteMany({ where: { model, recordId: { in: recordIds } } });
}
