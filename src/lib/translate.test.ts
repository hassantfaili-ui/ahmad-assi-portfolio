import { describe, expect, it } from 'vitest';

import { applyTranslation, overlay, type ModelTranslations } from './translate';

/**
 * French is laid over English, and English shows through wherever French is
 * missing. That fallback is the reason the site could go bilingual before a
 * single sentence was translated, so it is the part worth pinning down.
 */
describe('laying a translation over a record', () => {
  const project = { id: 'p1', title: 'The Eye', summary: 'A courtyard', role: 'Designer' };

  it('uses the French where there is French', () => {
    const result = applyTranslation(project, ['title', 'summary', 'role'], {
      title: "L'Oeil",
      summary: 'Une cour',
    });

    expect(result).toMatchObject({ title: "L'Oeil", summary: 'Une cour', role: 'Designer' });
  });

  it('leaves the English wherever the French is missing', () => {
    const result = applyTranslation(project, ['title', 'summary', 'role'], { title: "L'Oeil" });
    expect(result.summary).toBe('A courtyard');
    expect(result.role).toBe('Designer');
  });

  it('treats a box left blank as untranslated rather than as empty text', () => {
    /* Otherwise opening a French box and closing it again publishes a heading
       with nothing in it, which is worse than the English. */
    const result = applyTranslation(project, ['title', 'summary'], { title: '   ', summary: '' });
    expect(result.title).toBe('The Eye');
    expect(result.summary).toBe('A courtyard');
  });

  it('ignores a translation for a field nobody asked for', () => {
    /* A field renamed in the schema leaves its old translations behind. They
       must not come back as values the page never expected. */
    const result = applyTranslation(project, ['title'], { title: "L'Oeil", oldField: 'stale' });
    expect(result).not.toHaveProperty('oldField');
  });

  it('hands the record straight back when there is nothing for it', () => {
    expect(applyTranslation(project, ['title'], undefined)).toBe(project);
    expect(applyTranslation(project, ['title'], {})).toBe(project);
  });

  it('lays a whole list over in one pass, each row getting its own', () => {
    const rows = [
      { id: 'a', alt: 'The courtyard', caption: 'Phase two' },
      { id: 'b', alt: 'The lookout', caption: 'From the levee' },
    ];
    const translations: ModelTranslations = new Map<string, Record<string, string>>([
      ['a', { alt: 'La cour' }],
      ['b', { caption: 'Depuis la digue' }],
    ]);

    const result = overlay(rows, ['alt', 'caption'], translations);

    expect(result[0]).toMatchObject({ alt: 'La cour', caption: 'Phase two' });
    expect(result[1]).toMatchObject({ alt: 'The lookout', caption: 'Depuis la digue' });
  });

  it('hands a list straight back when nothing is translated', () => {
    const rows = [{ id: 'a', alt: 'The courtyard' }];
    expect(overlay(rows, ['alt'], new Map())).toBe(rows);
  });
})

describe('naming a picture so its French survives a save', () => {
  it('names it by the project and the file, not by a row that is rewritten', async () => {
    const { pictureKey } = await import('./translate');
    /* Saving a project deletes and recreates every picture row, so the row id is
       new every time. The file and the project are what stay. */
    expect(pictureKey('p1', 'm1')).toBe('p1:m1');
    expect(pictureKey('p1', 'm1')).toBe(pictureKey('p1', 'm1'));
  });

  it('keeps the same photograph separate between two projects', async () => {
    const { pictureKey } = await import('./translate');
    expect(pictureKey('p1', 'm1')).not.toBe(pictureKey('p2', 'm1'));
  });
})
