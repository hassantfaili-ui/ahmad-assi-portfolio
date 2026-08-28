'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { GuardedLink } from '@/components/admin/GuardedLink';

import { cn } from '@/lib/utils';

/**
 * The order of the site, not the order these screens were built in.
 *
 * Home first because it is the page a visitor lands on, then the projects that
 * fill it, then the two pages behind it, then the library everything else draws
 * from. Settings is gone: its only content was the film behind Ahmad's name,
 * which is the first thing on the home page and is edited there now. The route
 * still exists and redirects, so a bookmark does not break.
 */
const LINKS = [
  { href: '/admin/home', label: 'Home' },
  { href: '/admin', label: 'Projects' },
  { href: '/admin/resume', label: 'Resume' },
  { href: '/admin/contact', label: 'Contact' },
  { href: '/admin/media', label: 'Media' },
];

/**
 * The bar above every editing screen.
 *
 * Its links go through GuardedLink rather than Link, and that is the whole
 * point of the shared unsaved work registry. A client side route change does
 * not fire beforeunload, so before this these were the one exit nothing
 * watched: writing ten minutes of description and then clicking Resume out of
 * habit discarded every word with no prompt, while the screen underneath said
 * "Not saved yet" the entire time.
 *
 * "View the site" stays an ordinary anchor. It crosses into a different root
 * layout, so it is a real document navigation and the browser's own warning
 * covers it.
 */
export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <span className="font-semibold tracking-tight">Ahmad Assi</span>

        <nav aria-label="Editing">
          <ul className="flex gap-1">
            {LINKS.map((link) => {
              const current =
                link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
              return (
                <li key={link.href}>
                  <GuardedLink
                    href={link.href}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm transition-colors',
                      current
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                    )}
                  >
                    {link.label}
                  </GuardedLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-900" prefetch={false}>
            View the site
          </Link>
          <span className="hidden sm:inline">{email}</span>
        </div>
      </div>
    </header>
  );
}
