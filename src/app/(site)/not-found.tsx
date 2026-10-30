import type { Metadata } from 'next';

import NotFoundPageBody, { notFoundMetadata } from '@/components/site/pages/NotFoundPage';

/**
 * The site's 404, and the one for every address outside /fr.
 *
 * A French address that matches no route at all lands here rather than on the
 * French one, because Next resolves an unmatched URL against the boundary at
 * the root of the tree and there is only one of those. /fr/not-found.tsx
 * catches the case that can be caught: a French page that calls notFound()
 * itself, which is every /fr/work/[slug] with a slug nobody has published.
 */
export const metadata: Metadata = notFoundMetadata('en');

export default function NotFound() {
  return <NotFoundPageBody locale="en" />;
}
