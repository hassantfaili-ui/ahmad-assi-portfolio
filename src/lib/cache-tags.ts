/**
 * The paths a write has to regenerate, in one place.
 *
 * Named here rather than spelled out at each call site because a path typed
 * slightly wrong is a page that silently never updates, and that looks exactly
 * like the save not having worked. There is nothing to see and nothing logged.
 *
 * Paths rather than cache tags. See the comment at the top of src/lib/queries.ts
 * for why the data cache layer came out: the pages are held as rendered HTML in
 * KV, so the path is the thing that decides what a visitor sees.
 */
export const PATHS = {
  home: '/',
  architecture: '/architecture',
  resume: '/resume',
  contact: '/contact',
  print: '/print',
  project: (slug: string) => `/work/${slug}`,
} as const;

/**
 * The same page in both languages.
 *
 * Every path below existed before the site had a French half, and adding /fr
 * without adding it here meant an edit regenerated the English page and left
 * the French one showing the old words until the next deploy. The site is one
 * site in two languages, so a write regenerates both or it has not finished.
 *
 * The print sheet is English only and has no French twin, so it is left alone.
 */
function bothLanguages(paths: string[]): string[] {
  return paths.flatMap((path) =>
    path === PATHS.print ? [path] : [path, path === '/' ? '/fr' : `/fr${path}`],
  );
}

/** One path in both languages, for a write that regenerates a single page. */
export function inBothLanguages(path: string): string[] {
  return bothLanguages([path]);
}

/** Every listing a project appears in, plus its own page, in both languages. */
export function projectPaths(slug: string): string[] {
  return bothLanguages([PATHS.home, PATHS.architecture, PATHS.print, PATHS.project(slug)]);
}

/** The profile is in the header and footer of every page, in both languages. */
export function profilePaths(): string[] {
  return bothLanguages([
    PATHS.home,
    PATHS.architecture,
    PATHS.resume,
    PATHS.contact,
    PATHS.print,
  ]);
}
