import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/* Static, and deliberately so. A not found page that reads the database would
   turn every missing URL into a query, and it has nothing to say that the
   database holds. */
export const metadata: Metadata = {
  title: 'Page not found, Ahmad Assi',
  description: 'That page does not exist.',
  openGraph: {
    title: 'Page not found, Ahmad Assi',
    description: 'That page does not exist.',
    type: 'website',
  },
};

export default function NotFound() {
  return (
    <section className="hero load">
      <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
        {/* Written as escapes: a literal non-breaking space in source is invisible. */}
        {'Error \u00a0/\u00a0 '}
        <em>404</em>
      </p>
      <h1 className="page-title" style={{ '--i': 1 } as CSSProperties}>
        Off the map
      </h1>
      <p className="sub" style={{ '--i': 2 } as CSSProperties}>
        That page does not exist, or it has moved.
      </p>
      <p style={{ '--i': 3, marginTop: '2.5rem' } as CSSProperties}>
        <Link className="btn" href="/architecture">
          View the portfolio
        </Link>
      </p>
    </section>
  );
}
