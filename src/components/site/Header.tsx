'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import LanguageToggle from './LanguageToggle';
import ThemeToggle from './ThemeToggle';
import { words } from '@/lib/dictionary';
import { localePath, type Locale } from '@/lib/i18n';

/**
 * The four pages, in order.
 *
 * The label is a dictionary key rather than a word, because the header is the
 * one place on the site where every language has to say the same four things.
 * The path is the English address, which is the address itself: localePath
 * below turns it into the French one and leaves the English alone.
 */
const PAGES = [
  { phrase: 'home', href: '/' },
  { phrase: 'architecture', href: '/architecture' },
  { phrase: 'resume', href: '/resume' },
  { phrase: 'contact', href: '/contact' },
] as const;

/**
 * True when the given internal path is the page currently being rendered.
 * A trailing slash is ignored, so /resume and /resume/ both match.
 */
function isCurrent(pathname: string, href: string): boolean {
  const norm = (s: string) => (s.length > 1 ? s.replace(/\/+$/, '') : s);
  return norm(pathname) === norm(href);
}

/**
 * A client component only because aria-current has to follow the route. The
 * pathname is known while the page is prerendered, so the current page is
 * already marked in the HTML a visitor receives, not after hydration.
 */
export default function Header({ name, locale = 'en' }: { name: string; locale?: Locale }) {
  const pathname = usePathname();
  const w = words(locale);

  return (
    <header className="top">
      <Link className="wordmark" href={localePath(locale, '/')}>
        {name}
      </Link>

      {/* The dictionary has no word for this label yet, so French readers hear
          the English one. It happens to be the same word in both. */}
      <nav aria-label="Pages">
        <ul className="pages">
          {PAGES.map((p) => {
            /* Compared against the pathname in its localised form, so /fr/resume
               is current on the French site and /resume on the English one. */
            const href = localePath(locale, p.href);
            return (
              <li key={p.href}>
                <Link href={href} aria-current={isCurrent(pathname, href) ? 'page' : undefined}>
                  {w[p.phrase]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* The two switches share one cell. The header is a three column grid and
          a fourth child would wrap the row, so they are grouped rather than
          placed side by side. Language first, which leaves the theme switch at
          the end of the row where it has always been. */}
      <div className="switches">
        <LanguageToggle locale={locale} />
        <ThemeToggle locale={locale} />
      </div>
    </header>
  );
}
