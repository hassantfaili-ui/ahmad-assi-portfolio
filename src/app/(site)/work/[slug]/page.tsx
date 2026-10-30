import type { Metadata } from 'next';

import WorkPageBody, { projectParams, workMetadata } from '@/components/site/pages/WorkPage';

interface WorkPageProps {
  params: Promise<{ slug: string }>;
}

/** Every published project, prerendered. /fr/work/[slug] prerenders the same set. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return projectParams();
}

export async function generateMetadata({ params }: WorkPageProps): Promise<Metadata> {
  const { slug } = await params;
  return workMetadata('en', slug);
}

export default async function WorkPage({ params }: WorkPageProps) {
  const { slug } = await params;
  return <WorkPageBody locale="en" slug={slug} />;
}
