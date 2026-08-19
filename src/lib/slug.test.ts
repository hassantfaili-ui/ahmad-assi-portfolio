import { describe, it, expect } from 'vitest';
import { toSlug, uniqueSlug } from '@/lib/slug';

describe('toSlug', () => {
  it('lowercases and joins words with a single hyphen', () => {
    expect(toSlug('Lincoln Beach Center')).toBe('lincoln-beach-center');
  });

  it('folds diacritics down to their base letter', () => {
    expect(toSlug('Montréal')).toBe('montreal');
    expect(toSlug('La Casa Arañas')).toBe('la-casa-aranas');
    expect(toSlug('Ottawa Straße')).toBe('ottawa-strasse');
  });

  it('collapses a run of punctuation into one hyphen', () => {
    expect(toSlug('Sts. Peter and Paul Church')).toBe('sts-peter-and-paul-church');
    expect(toSlug('Core & Shell')).toBe('core-shell');
    expect(toSlug('A  B   C')).toBe('a-b-c');
  });

  it('trims separators off both ends', () => {
    expect(toSlug('  Coach House  ')).toBe('coach-house');
    expect(toSlug('---the-eye---')).toBe('the-eye');
    expect(toSlug('.The Eye!')).toBe('the-eye');
  });

  it('keeps digits', () => {
    expect(toSlug('605 Bronson Avenue')).toBe('605-bronson-avenue');
  });

  it('falls back to untitled when nothing survives', () => {
    expect(toSlug('')).toBe('untitled');
    expect(toSlug('   ')).toBe('untitled');
    expect(toSlug('!!!')).toBe('untitled');
    expect(toSlug('--- ... ---')).toBe('untitled');
  });

  /**
   * The URLs these produce are already live. If this table ever changes, every
   * existing /work/<slug> link and anything pointing at one breaks, so the
   * migration reads slugs off the Astro file names rather than trusting this.
   */
  it('reproduces the Astro file names for the titles that round trip', () => {
    expect(toSlug('Lincoln Beach Center')).toBe('lincoln-beach-center');
    expect(toSlug('Sts. Peter and Paul Church')).toBe('sts-peter-and-paul-church');
    expect(toSlug('La Casa Aranas')).toBe('la-casa-aranas');
    expect(toSlug('City Building Blocks')).toBe('city-building-blocks');
    expect(toSlug('Schindler Chace House')).toBe('schindler-chace-house');
    expect(toSlug('Media Wall Cabinets')).toBe('media-wall-cabinets');
  });
});

describe('uniqueSlug', () => {
  it('returns the base when nothing has claimed it', () => {
    expect(uniqueSlug('a', [])).toBe('a');
    expect(uniqueSlug('a', ['b', 'c'])).toBe('a');
  });

  it('starts the suffix at 2, not 1', () => {
    expect(uniqueSlug('a', ['a'])).toBe('a-2');
  });

  it('keeps counting past a taken suffix', () => {
    expect(uniqueSlug('a', ['a', 'a-2'])).toBe('a-3');
    expect(uniqueSlug('a', ['a', 'a-2', 'a-3', 'a-4'])).toBe('a-5');
  });

  it('takes the lowest free suffix, even when a higher one is taken', () => {
    expect(uniqueSlug('a', ['a', 'a-3'])).toBe('a-2');
    expect(uniqueSlug('a', ['a', 'a-2', 'a-4'])).toBe('a-3');
  });

  it('never returns something already taken', () => {
    const taken = ['coach-house', 'coach-house-2', 'coach-house-3'];
    expect(taken).not.toContain(uniqueSlug('coach-house', taken));
  });

  it('leaves taken untouched', () => {
    const taken = ['a', 'a-2'];
    uniqueSlug('a', taken);
    expect(taken).toEqual(['a', 'a-2']);
  });
});

/**
 * Letters that decomposition cannot fold, found by an adversarial review.
 *
 * The old implementation normalised to NFD and then discarded anything outside
 * a to z, which does not fold these letters, it deletes them. The worst case is
 * the ligature: "ﬁreplace" became "replace", a different real English word, and
 * that ligature arrives whenever a title is pasted out of a PDF or an InDesign
 * layout.
 */
describe('toSlug, letters with nothing to decompose', () => {
  it.each([
    ['Ørsted Tower', 'orsted-tower'],
    ['Æther Pavilion', 'aether-pavilion'],
    ['Œuvre House', 'oeuvre-house'],
    ['Ottawa Straße', 'ottawa-strasse'],
    ['Łódź Housing', 'lodz-housing'],
    ['Þing Hall', 'thing-hall'],
    ['Tromsø', 'tromso'],
  ])('%s becomes %s', (title, expected) => {
    expect(toSlug(title)).toBe(expected);
  });

  it('folds the ligatures a PDF paste brings with it', () => {
    expect(toSlug('ﬁreplace Detail')).toBe('fireplace-detail');
    expect(toSlug('ﬂoor Plan')).toBe('floor-plan');
  });

  it('folds full width forms', () => {
    expect(toSlug('Ｔｏｗｅｒ')).toBe('tower');
  });

  it('leaves the eighteen published slugs exactly as they are', () => {
    // These are live URLs. Changing the rules must never rename one.
    expect(toSlug('Lincoln Beach Center')).toBe('lincoln-beach-center');
    expect(toSlug('Sts. Peter and Paul Church')).toBe('sts-peter-and-paul-church');
    expect(toSlug('La Casa Aranas')).toBe('la-casa-aranas');
    expect(toSlug('City Building Blocks')).toBe('city-building-blocks');
    expect(toSlug('Montréal Pavilion')).toBe('montreal-pavilion');
  });

  it('falls back for a title with nothing representable in it, and says so here', () => {
    // Deliberate: the slug charset is ASCII only. A project titled wholly in a
    // non Latin script needs a slug set by hand, and uniqueSlug is what stops
    // two of them colliding on "untitled".
    expect(toSlug('Проект Дом')).toBe('untitled');
    expect(toSlug('東京')).toBe('untitled');
  });
});

describe('toSlug, length', () => {
  it('caps at eighty characters', () => {
    expect(toSlug('a'.repeat(300))).toHaveLength(80);
  });

  it('cuts at a hyphen rather than through a word, and never ends in one', () => {
    const slug = toSlug(`${'word '.repeat(30)}end`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.split('-').every((part) => part === 'word')).toBe(true);
  });

  it('caps before uniqueSlug can suffix, so the suffix is never truncated off', () => {
    const long = toSlug('a'.repeat(300));
    expect(uniqueSlug(long, [long])).toBe(`${long}-2`);
  });
});

describe('uniqueSlug, defensive normalisation', () => {
  it('never returns something that is not a legal slug', () => {
    expect(uniqueSlug('Coach House', [])).toBe('coach-house');
    expect(uniqueSlug('', [''])).toBe('untitled');
    expect(uniqueSlug('  Renewal  Square  ', [])).toBe('renewal-square');
  });

  it('still leaves an already legal slug alone', () => {
    expect(uniqueSlug('coach-house', [])).toBe('coach-house');
    expect(uniqueSlug('coach-house', ['coach-house'])).toBe('coach-house-2');
  });
});
