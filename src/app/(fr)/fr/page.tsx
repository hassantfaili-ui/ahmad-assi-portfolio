import type { Metadata } from 'next';

import HomePage, { homeMetadata } from '@/components/site/pages/HomePage';

/** The home page, in French. The English one at / renders the same component. */
export async function generateMetadata(): Promise<Metadata> {
  return homeMetadata('fr');
}

export default function FrenchHome() {
  return <HomePage locale="fr" />;
}
