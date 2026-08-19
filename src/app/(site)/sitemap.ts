import type { MetadataRoute } from 'next';

import { getProjectSlugs } from '@/lib/queries';

/**
 * The site's own map, for crawlers.
 *
 * There was none, so the twenty three public URLs were only discoverable by
 * following links. That works, but for a portfolio whose whole job is to be
 * found by people looking for an architect, advertising the pages is worth the
 * twenty lines.
 *
 * Project pages are read from the database rather than listed here, so a
 * project Ahmad publishes appears in the sitemap without anyone editing code.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://ahmadassi.ca';
  const now = new Date();

  const fixed = ['', '/architecture', '/resume', '/contact'].map((path) => ({
    url: `${base}${path}/`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: path === '' ? 1 : 0.8,
  }));

  let projects: MetadataRoute.Sitemap = [];
  try {
    const slugs = await getProjectSlugs();
    projects = slugs.map((slug) => ({
      url: `${base}/work/${slug}/`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch {
    /* A sitemap is not worth failing a build over. Without the database it
       lists the fixed pages, which is better than no sitemap at all. */
  }

  return [...fixed, ...projects];
}
