import type { Metadata } from 'next';

import ArchitecturePage, { architectureMetadata } from '@/components/site/pages/ArchitecturePage';

/** The portfolio, in French. /architecture renders the same component. */
export async function generateMetadata(): Promise<Metadata> {
  return architectureMetadata('fr');
}

export default function FrenchArchitecture() {
  return <ArchitecturePage locale="fr" />;
}
