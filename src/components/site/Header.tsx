'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import ThemeToggle from './ThemeToggle';

const PAGES = [
  { label: 'Home', href: '/' },
  { label: 'Architecture', href: '/architecture' },
  { label: 'Resume', href: '/resume' },
  { label: 'Contact', href: '/contact' },
];

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
export default function Header({ name }: { name: string }) {
  const pathname = usePathname();

  return (
    <header className="top">
      <Link className="wordmark" href="/">
        {name}
      </Link>

      <nav aria-label="Pages">
        <ul className="pages">
          {PAGES.map((p) => (
            <li key={p.href}>
              <Link href={p.href} aria-current={isCurrent(pathname, p.href) ? 'page' : undefined}>
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <ThemeToggle />
    </header>
  );
}
