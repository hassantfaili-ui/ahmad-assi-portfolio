import type { Metadata } from 'next';

import ContactPageBody, { contactMetadata } from '@/components/site/pages/ContactPage';

/** The contact page, in French. /contact renders the same component. */
export async function generateMetadata(): Promise<Metadata> {
  return contactMetadata('fr');
}

export default function FrenchContact() {
  return <ContactPageBody locale="fr" />;
}
