'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'Projects' },
  { href: '/admin/media', label: 'Media' },
  { href: '/admin/resume', label: 'Resume' },
  { href: '/admin/settings', label: 'Settings' },
];

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
                  <Link
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
                  </Link>
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
