import type { Metadata } from 'next';

import ResumePageBody, { resumeMetadata } from '@/components/site/pages/ResumePage';

/** The resume, in English. /fr/resume renders the same component. */
export async function generateMetadata(): Promise<Metadata> {
  return resumeMetadata('en');
}

export default function ResumePage() {
  return <ResumePageBody locale="en" />;
}
