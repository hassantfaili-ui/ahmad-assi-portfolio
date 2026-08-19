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

/** Every listing a project appears in, plus its own page. */
export function projectPaths(slug: string): string[] {
  return [PATHS.home, PATHS.architecture, PATHS.print, PATHS.project(slug)];
}

/** The profile is in the header and footer of every page. */
export function profilePaths(): string[] {
  return [PATHS.home, PATHS.architecture, PATHS.resume, PATHS.contact, PATHS.print];
}
