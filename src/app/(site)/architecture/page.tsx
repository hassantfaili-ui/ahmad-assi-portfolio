import type { Metadata } from 'next';

import ArchitecturePage, { architectureMetadata } from '@/components/site/pages/ArchitecturePage';

/** The portfolio, in English. /fr/architecture renders the same component. */
export async function generateMetadata(): Promise<Metadata> {
  return architectureMetadata('en');
}

export default function Architecture() {
  return <ArchitecturePage locale="en" />;
}
