import type { Metadata } from 'next';

import HomePage, { homeMetadata } from '@/components/site/pages/HomePage';

/**
 * The home page, in English, at the address it has always had.
 *
 * The page itself is the component. /fr renders the same one and says fr, which
 * is what keeps the two languages from drifting into two different pages.
 */
export async function generateMetadata(): Promise<Metadata> {
  return homeMetadata('en');
}

export default function Home() {
  return <HomePage locale="en" />;
}
