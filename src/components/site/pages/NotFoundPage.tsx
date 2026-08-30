import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { pageWords } from '@/components/site/pages/copy';
import { words } from '@/lib/dictionary';
import { localePath, type Locale } from '@/lib/i18n';

/**
 * What a visitor gets for an address the site does not have.
 *
 * Static, and deliberately so. A not found page that reads the database would
 * turn every missing URL into a query, and it has nothing to say that the
 * database holds. That is also why the name below is a literal: this is the one
 * page that must render when nothing else can.
 */
const FALLBACK_NAME = 'Ahmad Assi';

export function notFoundMetadata(locale: Locale): Metadata {
  const w = words(locale);

  return {
    title: `${pageWords(locale).pageNotFound}, ${FALLBACK_NAME}`,
    description: w.notFoundBody,
    /* No alternates. A page that does not exist has no counterpart in the other
       language to be paired with. */
    openGraph: {
      title: `${pageWords(locale).pageNotFound}, ${FALLBACK_NAME}`,
      description: w.notFoundBody,
      type: 'website',
    },
  };
}

export default function NotFoundPage({ locale }: { locale: Locale }) {
  const w = words(locale);
  const page = pageWords(locale);

  return (
    <section className="hero load">
      <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
        {/* Written as escapes: a literal non-breaking space in source is invisible. */}
        {`${page.error} \u00a0/\u00a0 `}
        <em>404</em>
      </p>
      <h1 className="page-title" style={{ '--i': 1 } as CSSProperties}>
        {w.notFoundTitle}
      </h1>
      <p className="sub" style={{ '--i': 2 } as CSSProperties}>
        {w.notFoundBody}
      </p>
      <p style={{ '--i': 3, marginTop: '2.5rem' } as CSSProperties}>
        {/* The portfolio, where it has always pointed. Somebody who mistyped an
            address wants the work, not the front door. */}
        <Link className="btn" href={localePath(locale, '/architecture')}>
          {w.viewPortfolio}
        </Link>
      </p>
    </section>
  );
}
