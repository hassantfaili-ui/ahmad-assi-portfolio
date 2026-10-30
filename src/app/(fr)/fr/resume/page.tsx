import type { Metadata } from 'next';

import ResumePageBody, { resumeMetadata } from '@/components/site/pages/ResumePage';

/**
 * The resume, in French, at /fr/resume.
 *
 * The address stays the English word. A translated path would be a second set
 * of URLs to keep alive forever, and localePath in src/lib/i18n.ts is built on
 * the English address being the address.
 */
export async function generateMetadata(): Promise<Metadata> {
  return resumeMetadata('fr');
}

export default function FrenchResume() {
  return <ResumePageBody locale="fr" />;
}
