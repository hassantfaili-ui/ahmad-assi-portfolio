import type { Metadata } from 'next';

import NotFoundPageBody, { notFoundMetadata } from '@/components/site/pages/NotFoundPage';

/**
 * The 404 for the French half of the site.
 *
 * A boundary here rather than one page for both because a not found page is
 * handed nothing to work out the language from: no parameters, no address.
 * Where the tree can answer the question, it should, and under /fr it can.
 */
export const metadata: Metadata = notFoundMetadata('fr');

export default function FrenchNotFound() {
  return <NotFoundPageBody locale="fr" />;
}
