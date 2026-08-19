/**
 * Slugs, and what to do when two of them collide.
 *
 * A slug is a URL, and a URL that has been published is a promise. Nothing in
 * here may be tuned casually: changing the rules renames every /work/<slug>
 * page at once, and the site has been indexed under the current names since the
 * Astro build. The migration therefore takes each project's slug from its
 * existing content file name and only calls toSlug for titles that have never
 * had a slug before.
 */

/** The slug given to a title that is empty, or that is nothing but punctuation. */
const FALLBACK = 'untitled';

/**
 * Combining marks, the tail end of an NFD decomposition.
 *
 * Normalising to NFD splits "e acute" into a plain "e" plus an accent
 * character, so deleting this range leaves the base letter behind. Folding
 * accents rather than hyphenating them is what sends an accented Montreal to
 * /work/montreal instead of the unreadable "montr-al". Written as escapes
 * because a literal combining mark in source is invisible to whoever reads it.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Letters that carry no accent to strip, so decomposition cannot help them.
 *
 * This exists because of a real failure. Normalising and then discarding
 * anything outside a to z does not fold these, it deletes them: an unfixed
 * toSlug turned "Ørsted" into "rsted", "Straße" into "stra-e" and, worst of
 * all, the ligature in "ﬁreplace" into "replace", which is a different real
 * English word. That ligature is not exotic. It arrives whenever a title is
 * pasted out of a PDF or an InDesign layout, which for an architecture practice
 * is how titles usually arrive.
 *
 * NFKD below folds the ligatures and the full width forms. This table covers
 * what is left, which is the letters that are genuinely their own characters
 * rather than a base plus a mark.
 */
const TRANSLITERATIONS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ħ: 'h',
  ŋ: 'ng',
  ı: 'i',
};

/**
 * A slug is also a path segment and a unique column, so it is capped.
 *
 * Capped inside toSlug, before the fallback and therefore before uniqueSlug
 * ever appends a suffix. A cap applied by a caller afterwards would truncate
 * the "-2" back off and silently reintroduce the collision the suffix existed
 * to prevent.
 */
const MAX_LENGTH = 80;

export function toSlug(title: string): string {
  const folded = title
    // NFKD rather than NFD: compatibility decomposition is what folds the fi and
    // fl ligatures into their letters, and full width forms into ASCII.
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, (character) => TRANSLITERATIONS[character] ?? ' ');

  const slug = folded
    // One pass over runs, so "Sts. Peter" gives a single hyphen, not two.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Trimmed back to a hyphen so the cap never cuts a word in half, and never
  // leaves a trailing hyphen behind.
  const capped =
    slug.length > MAX_LENGTH
      ? slug.slice(0, MAX_LENGTH).replace(/-[^-]*$/, '').replace(/-+$/, '')
      : slug;

  return capped || FALLBACK;
}

/**
 * The first slug not already in `taken`, counting from `-2`.
 *
 * It starts at 2 because the unsuffixed slug is itself the first of its name.
 * It then takes the lowest free suffix, which means a number freed by a
 * deletion gets handed out again: pass every slug ever issued, not only the
 * live ones, if an old URL must never be pointed at a different building.
 */
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function uniqueSlug(base: string, taken: readonly string[]): string {
  // Normalised rather than trusted. Called with a raw title this used to return
  // it verbatim, so "Coach House" went straight into a URL path and a @unique
  // column with a space in it, and an empty base produced "-2", which breaks the
  // no leading hyphen rule toSlug itself enforces.
  const root = SLUG_SHAPE.test(base) ? base : toSlug(base);

  // A Set, and a copy: `taken` belongs to the caller and this must not touch it.
  const used = new Set(taken);
  if (!used.has(root)) return root;

  let n = 2;
  while (used.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}
