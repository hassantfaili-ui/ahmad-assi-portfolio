import type { Metadata } from 'next';

import WorkPageBody, { projectParams, workMetadata } from '@/components/site/pages/WorkPage';

interface WorkPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Every published project, prerendered in French too.
 *
 * The same slugs as the English page, because a slug is an address and an
 * address is not translated. Seventeen projects become thirty four pages, all
 * of them built ahead of time.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return projectParams();
}

export async function generateMetadata({ params }: WorkPageProps): Promise<Metadata> {
  const { slug } = await params;
  return workMetadata('fr', slug);
}

export default async function FrenchWork({ params }: WorkPageProps) {
  const { slug } = await params;
  return <WorkPageBody locale="fr" slug={slug} />;
}
