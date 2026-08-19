/**
 * Cache tag names, in one place so a read and the write that invalidates it
 * cannot drift apart. A typo here is a page that silently never updates, which
 * looks exactly like the save not having worked.
 */
export const TAGS = {
  /** Every listing of projects: the home page and /architecture. */
  projects: 'projects',
  /** One project's own page. */
  project: (slug: string) => `project:${slug}`,
  /** The profile and every resume list. */
  profile: 'profile',
  /** The site hero film. */
  hero: 'hero',
} as const;
