import type { MetadataRoute } from 'next';

import { HTML_LANG, LOCALES, localePath, type Locale } from '@/lib/i18n';
import { getProjectSlugs } from '@/lib/queries';

/**
 * The site's own map, for crawlers.
 *
 * There was none, so the public URLs were only discoverable by following links.
 * That works, but for a portfolio whose whole job is to be found by people
 * looking for an architect, advertising the pages is worth the thirty lines.
 *
 * Project pages are read from the database rather than listed here, so a
 * project Ahmad publishes appears in the sitemap without anyone editing code.
 *
 * Every page is listed twice, once per language, and each listing names both
 * addresses. That pairing is the part that matters: without it the English page
 * and the French page look like two unrelated pages that happen to be similar,
 * and they compete with each other instead of being offered to the reader who
 * wants that language.
 */
const BASE = 'https://ahmadassi.ca';

/**
 * One page's address in one language.
 *
 * The trailing slash is not decoration. The Astro build wrote
 * /resume/index.html, next.config.ts keeps trailingSlash on for the same
 * reason, and a sitemap that disagreed with the canonical on every page would
 * be telling a crawler two different things about the same page.
 */
function url(locale: Locale, path: string): string {
  const localised = localePath(locale, path);
  return `${BASE}${localised === '/' ? '' : localised}/`;
}

/** The same page in every language, for the alternates on each listing. */
function languagesOf(path: string): Record<string, string> {
  return {
    [HTML_LANG.en]: url('en', path),
    [HTML_LANG.fr]: url('fr', path),
    'x-default': url('en', path),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  let projectPaths: string[] = [];
  try {
    const slugs = await getProjectSlugs();
    projectPaths = slugs.map((slug) => `/work/${slug}`);
  } catch {
    /* A sitemap is not worth failing a build over. Without the database it
       lists the fixed pages, which is better than no sitemap at all. */
  }

  /* The English paths, which are the paths: localePath turns each one into its
     French address and leaves the English alone. */
  const pages = [
    ...['/', '/architecture', '/resume', '/contact'].map((path) => ({
      path,
      priority: path === '/' ? 1 : 0.8,
    })),
    ...projectPaths.map((path) => ({ path, priority: 0.7 })),
  ];

  return pages.flatMap(({ path, priority }) =>
    LOCALES.map((locale) => ({
      url: url(locale, path),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority,
      alternates: { languages: languagesOf(path) },
    })),
  );
}
