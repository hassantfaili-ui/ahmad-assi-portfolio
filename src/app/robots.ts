import type { MetadataRoute } from 'next';

/**
 * What crawlers may look at.
 *
 * This file sits at the app root rather than inside the (site) group, and it
 * has to. sitemap.ts generates perfectly well from inside the group, but
 * robots.ts placed there produced no /robots.txt at all, silently: the build
 * listed the sitemap and simply omitted robots. Moving it here fixed it.
 *
 * /admin and /api are behind Cloudflare Access and answer a redirect to a login
 * rather than content, so this is tidiness rather than protection. It is worth
 * saying anyway: a crawler that never asks is better than one that asks and is
 * turned away.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api', '/print'],
    },
    sitemap: 'https://ahmadassi.ca/sitemap.xml',
  };
}
